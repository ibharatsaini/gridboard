# GridBoard

A real-time multiplayer shared grid. Everyone who opens the app joins one 50 × 50 board, claims cells, holds
territory and climbs a live leaderboard. When one player claims a cell, every other player sees it immediately.

**Correctness model:** PostgreSQL decides who owns a cell (one atomic conditional `UPDATE`). Redis (Upstash) only
speeds things up and fans events out. Losing Redis can never produce two owners of one cell or bypass the cooldown.

## Features

Claim with cooldown (5 s) and cell lock (10 s) · territory scoring · live leaderboard, stats, presence, activity feed ·
claim history · zoom / pan / pinch / reset · keyboard play · reconnect + reconciliation · optimistic UI · toasts and
connection states · server-enforced rules (the UI timers are cosmetic).

## Technology stack and version matrix

Versions are read from the installed dependency tree (`pnpm -r ls`), not typed from memory.

| Technology | Version | Status / note |
|---|---|---|
| Node.js | 22.x (tested on 22.22.0), `engines: >=22.12.0` | Supported by every dependency. **Not verified as the current Active LTS** (nodejs.org was unreachable from the authoring sandbox) — Node 24 also satisfies all engine ranges; bump `.nvmrc` if you prefer it |
| pnpm | 10.28.0 | Stable |
| Vite | 8.3.4 | Stable (npm `latest`). With `@vitejs/plugin-react` 6.1.2 and `@tailwindcss/vite` 4.3.3 |
| React / React DOM | 19.3.0 | Stable |
| TypeScript | 6.0.3 | Stable. **Deliberately not 7.0.2** (npm `latest`): typescript-eslint 8.71 declares `typescript <6.1.0` |
| Tailwind CSS | 4.3.3 | Stable |
| Express | 5.2.1 | Stable |
| Socket.IO (+ client) | 4.8.4 | Stable |
| @socket.io/redis-adapter | 8.3.0 | Stable (classic Pub/Sub; sharded Pub/Sub is not available on Upstash) |
| Prisma + @prisma/client + adapter-pg | 7.10.0 | Stable. **Deliberately not 8.0.0-rc.19** (npm `latest` is an RC; `prev` is 7.10.0) |
| PostgreSQL | 16 | Stable |
| @upstash/redis / @upstash/ratelimit | 1.39.0 / 2.2.0 | Stable |
| ioredis | 5.11.1 | Stable. Kept on 5.x (the adapter's documented client); 6.0.0 exists but was not evaluated with the adapter |
| TanStack Query | 5.104.1 | Stable |
| Zustand | 5.0.15 | Stable |
| Zod | 4.6.5 | Stable |
| Motion | 14.0.0 | Stable |
| ESLint | 9.39.5 | Pinned to 9.x: `eslint-plugin-jsx-a11y` 6.10.2 peer-depends on `eslint ^9` (with `eslint-plugin-react-hooks` 7.1.1 and `eslint-plugin-react-refresh` 0.5.7) |
| Prettier | 3.9.9 | Stable |

## Repository structure

```
apps/api        Express 5 + Socket.IO (routes → controllers → services → Prisma/SQL)
apps/web        Vite + React single-page app (client-rendered board; Zustand + TanStack Query)
packages/shared Zod schemas, REST DTOs, Socket.IO event contracts, constants (single source of truth)
packages/config Shared tsconfig
prisma/         schema.prisma and the SQL migrations
```

## Local setup

```bash
pnpm install
cp .env.example .env              # then fill the three Upstash values
pnpm db:generate                  # generate the Prisma client
pnpm db:migrate                   # apply migrations
pnpm db:seed                      # 2,500 cells; idempotent
pnpm dev                          # web :3000, api :4000
```

Upstash (free tier is enough): create a Redis database, then copy **both** the REST URL/token *and* the
`rediss://…` TCP URL from the console. REST handles rate limits/cooldown/presence; the TCP URL is needed because
Socket.IO's adapter must `SUBSCRIBE`, which REST cannot do.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `WEB_URL`, `API_URL` | Exact web origin (CORS and Origin checks for REST and WebSocket) and the API's own URL. They may be on different domains |
| `TRUST_PROXY` | Reverse-proxy hop count, for real client IPs (set `1` behind Render/most hosts) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting, cooldown fast-path, presence |
| `UPSTASH_REDIS_URL` | TCP/TLS URL for Socket.IO Pub/Sub |
| `VITE_API_URL` | (web, `apps/web/.env`) public API origin, default `http://localhost:4000`; contains no secrets. It is read at **build time** |

All variables are validated with Zod at startup; the process exits listing every problem (never echoing values).
Redis secrets and DB credentials exist only in the API process; the web bundle receives none.

## Commands

`pnpm dev | build | lint | typecheck | db:migrate | db:seed | db:generate | db:reset | db:status`

## Architecture
```
 Browser ── REST (commands) ─────────┐
    ▲                                ▼
    └── Socket.IO (events) ◄── Express + Socket.IO ──► PostgreSQL (truth, via Prisma)
                                     │
                                     └──────────────► Upstash Redis (rate limit, cooldown fast-path,
                                                       presence, Socket.IO Pub/Sub fan-out)
```

Commands are REST; events are Socket.IO. The client cannot emit anything the server acts on.

### Cell claim flow

```
click → "CLAIMING" (UI hint only) → POST /api/v1/cells/:id/claim
  → IP rate limit (Redis) → session auth (bearer token) → per-user rate limit (Redis) → Zod id check
  → Redis cooldown reservation (SET NX PX)                       fast path, not authoritative
  → Redis per-cell gate (SET NX PX, compare-and-delete release)  one claimant per cell enters; the rest
                                                                 are rejected without touching Postgres
  → cell.findUnique ‖ user.findUnique        pre-checks in parallel (missing / yours / locked): no writes yet
  → user.updateMany  WHERE last_claim_at IS NULL OR <= now - cooldown   atomic cooldown check-and-stamp
  → cell.update      WHERE id AND version = <value read>  THE atomic claim: the DB picks the winner
       + nested claims.create + nested activity.create     history row AND feed row commit with the ownership change
       P2025 (no match) ⇒ lost: CAS the cooldown back, release Redis key, answer 409 with the winner
  → queue the claim; one CELLS_CLAIMED message per 50 ms window → Redis Pub/Sub → every API instance → every socket
  → debounced STATS_UPDATED + LEADERBOARD_UPDATED; USER_STATS_UPDATED once per affected user per batch
```

### Concurrency
There is no explicit transaction anywhere in the code; every database call is a single Prisma Client query
(no raw SQL). Atomicity comes from **optimistic concurrency**: a cell carries a `version` that increments on every
ownership change, and the claim is `cell.update({ where: { id, version: <version we read> } })`. Of N claimants who
read the same version, exactly one `UPDATE` matches; the rest get `P2025` and lose cleanly. The claim-history row is
created in the same call through a nested `claims.create`, so it cannot exist without the ownership change. The
cooldown stamp is guarded the same way (`where: { lastClaimAt: <value read> }`), so one user's parallel burst lets
exactly one claim through. A losing claim restores the cooldown stamp with a compare-and-swap, so a lost race is not
charged. Lock and cooldown times use the API server's clock, so with several instances clock skew can shift a
lock/cooldown edge by the skew (keep instances NTP-synced); it can never change who wins a race.

**Honest limits of the no-transaction design.** The cooldown stamp and the cell update are two separate writes, so a
process crash between them would leave a player on cooldown without having claimed (self-heals within one cooldown).
The claim-history row and the activity-feed row are nested writes of the same `cell.update`, so they commit with the
ownership change or not at all (`activity_events.cell_id` is a real foreign key for exactly this reason).

### Rules
- **Cooldown** 5 s per user. Redis `SET NX PX` rejects spam cheaply; Postgres `users.last_claim_at` is the durable
  backstop (Redis flush or outage cannot bypass it). Rate limiting (10 claims/10 s/user, 100/10 s/IP, 10 joins/min/IP;
  sliding window) is separate: it protects the server, while the cooldown is a game rule.
- **Lock** 10 s after a claim. During the lock nobody can take the cell; afterwards others can take it over. Owners
  cannot re-claim their own cell.
- **Territory**: 1 point per cell, plus `(size − 1)` for each orthogonally connected group, via an iterative BFS flood
  fill (one O(N) pass for all owners). Computed server-side only when a claim commits, never per render.
- **Leaderboard**: top 10 by score; one scan of owned cells feeds counts and standings. Not cached in Redis: at
  ≤ 2,500 rows it is a single cheap query, and broadcasts are debounced (120 ms trailing, 400 ms max wait).
- **Presence**: Redis sorted set `member = user|instance:socket`, `score = expiry`. Each instance refreshes its own
  sockets every 15 s (45 s TTL), so crashed instances age out with no cleanup job. Online counts distinct users.
  Trade-off: after a hard crash the count can lag up to 45 s.

### Redis failure behaviour
| Failure | Effect |
|---|---|
| Redis down during a claim | Cooldown fast-path and rate limiters fail open (logged as `redis_error`); Postgres still enforces cooldown and ownership |
| Redis down after commit | Claim returns 200; broadcast failure is logged; clients heal via reconnect reconciliation |
| Redis flushed | Cooldown still enforced from `last_claim_at` |

### Reconnection
Socket.IO events are not durable. On every `connect` (first and after reconnects) the client refetches grid, stats,
leaderboard, activity and `me`, and merges cells **by version**, so a fetched grid can never overwrite a newer live event.
Events are deduplicated by `eventId`; stale cell events (`version ≤` current) are dropped without re-rendering.


### State ownership
TanStack Query: session/stats/leaderboard/activity (server collections, updated by socket events via `setQueryData`).
Zustand: normalised cells, optimistic flags, zoom/pan, connection status (fine-grained or UI-only). No state lives in
two places.

### Security
**Auth is a bearer token, not a cookie.** `POST /users/join` returns an opaque 256-bit token once; the server keeps
only its SHA-256. The browser stores it in `localStorage` and sends `Authorization: Bearer <token>` on every request
and `auth: { token }` in the Socket.IO handshake (never in a URL, so it cannot land in access logs). Identity always
comes from the session: the claim body is ignored. Because nothing is attached automatically, there is **no CSRF
surface** and no third-party-cookie problem, so the web app and the API can be on unrelated domains (e.g. Vercel +
Render). Logout revokes the session server-side; sessions also expire after 30 days.


## Deployment
Web: a static site (any static host or CDN; build with `pnpm --filter @gridboard/web build`, serve `apps/web/dist`, route unknown paths to `index.html`, and set `VITE_API_URL` **at build time**). API: any Node 22+ container host (`pnpm --filter @gridboard/api build`
then `start`), `/health` for liveness, `/ready` for readiness (fails during shutdown so the load balancer drains).
Use managed Postgres + Upstash. Web and API may be on different domains (e.g. Vercel + Render): set the API's
`WEB_URL` to the exact web origin and the web build's `VITE_API_URL` to the API URL. No cookie or CORS-credentials
setup is needed. Graceful shutdown on SIGTERM/SIGINT: drain readiness → close Socket.IO/HTTP → close Redis → disconnect Prisma.

## With another 1–2 days
Automated tests (unit, API integration, end-to-end) and checks against real Upstash; spatial rooms; a replay buffer (Redis Streams adapter) for
lossless reconnects; Prisma-schema-level CHECK constraints via a migration tool; load test the claim path; a runtime-tunable ruleset.
