import { createServer } from "node:http";
import { Redis as IORedis } from "ioredis";
import { CLAIM_COOLDOWN_MS } from "@gridboard/shared";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { createLogger } from "./config/logger";
import type { AppDeps } from "./container";
import { createPrisma } from "./lib/prisma";
import {
  checkSchema,
  describeDatabase,
  formatSchemaProblems,
} from "./lib/schema-check";
import { PresenceService } from "./redis/presence";
import { CellGate } from "./redis/cell-gate";
import { CooldownStore } from "./redis/cooldown-store";
import {
  createUpstashRateLimiters,
  createUpstashRest,
  UpstashRedisPort,
} from "./redis/upstash";
import { createRealtime, newInstanceId } from "./realtime/socket";
import { BoardService } from "./services/board.service";
import { BroadcastService } from "./services/broadcast.service";
import { ClaimService } from "./services/claim.service";
import { SessionService } from "./services/session.service";
import { UserService } from "./services/user.service";

async function main() {
  const env = loadEnv(); // throws (with every problem listed) before anything connects
  const logger = createLogger(env);
  const instanceId = newInstanceId();

  // --- Postgres (source of truth) ---
  const db = createPrisma(env.DATABASE_URL);
  const dbTarget = describeDatabase(env.DATABASE_URL);
  // Fail fast if the live tables don't match the schema, instead of failing on the first user's join.
  const problems = await checkSchema(db);
  if (problems.length > 0) {
    await db.$disconnect().catch(() => undefined);
    throw new Error(formatSchemaProblems(dbTarget, problems));
  }
  logger.info(
    { event: "database_ready", database: dbTarget },
    `database schema OK (${dbTarget})`,
  );

  // --- Upstash Redis ---
  // REST client: stateless commands (rate limits, cooldown, presence). Works from anywhere.
  const rest = createUpstashRest(
    env.UPSTASH_REDIS_REST_URL!,
    env.UPSTASH_REDIS_REST_TOKEN!,
  );
  const redis = new UpstashRedisPort(rest);
  // TCP client pair: Socket.IO's adapter needs real SUBSCRIBE, which REST cannot do.
  const makeTcp = () =>
    new IORedis(env.UPSTASH_REDIS_URL!, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 250, 5000),
    }).on("error", (err) =>
      logger.error(
        { event: "redis_error", op: "tcp", err: err.message },
        "redis tcp error",
      ),
    );
  const pub = makeTcp();
  const sub = pub
    .duplicate()
    .on("error", (err) =>
      logger.error(
        { event: "redis_error", op: "tcp_sub", err: err.message },
        "redis sub error",
      ),
    );

  // --- Services ---
  const limiters = createUpstashRateLimiters(rest, logger);
  const sessions = new SessionService(db);
  const users = new UserService(db, sessions);
  const board = new BoardService(db);
  const claims = new ClaimService(
    db,
    new CooldownStore(redis, CLAIM_COOLDOWN_MS, logger),
    new CellGate(redis, 5_000, logger),
    logger,
  );
  const presence = new PresenceService(redis, instanceId, logger);

  const httpServer = createServer();
  const realtime = createRealtime({
    httpServer,
    webOrigin: new URL(env.WEB_URL).origin,
    sessions,
    presence,
    logger,
    redisPubSub: { pub, sub },
  });
  const broadcaster = new BroadcastService(
    realtime.emitter,
    board,
    presence,
    logger,
  );
  realtime.bindBroadcaster(broadcaster);

  let shuttingDown = false;
  const deps: AppDeps = {
    env,
    logger,
    db,
    redis,
    limiters,
    sessions,
    users,
    board,
    claims,
    broadcaster,
    presence,
    isShuttingDown: () => shuttingDown,
  };
  httpServer.on("request", createApp(deps));

  const sessionJanitor = setInterval(
    () => {
      sessions
        .purgeExpired()
        .catch((err: unknown) =>
          logger.error(
            { event: "database_error", op: "sessions.purge", err },
            "session purge failed",
          ),
        );
    },
    60 * 60 * 1000,
  );
  sessionJanitor.unref();

  await new Promise<void>((resolve) => httpServer.listen(env.PORT, resolve));
  logger.info(
    { event: "server_started", port: env.PORT, instanceId, env: env.NODE_ENV },
    `API listening on :${env.PORT}`,
  );

  // --- Graceful shutdown ---
  async function shutdown(signal: string, exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true; // /ready now returns 503 so the load balancer drains us
    const force = setTimeout(() => {
      logger.error({ event: "shutdown_forced" }, "graceful shutdown timed out");
      process.exit(1);
    }, 10_000);
    force.unref();

    try {
      clearInterval(sessionJanitor);
      broadcaster.dispose();
      await realtime.close(); //  1+2+3: stop new sockets, disconnect clients, close the HTTP listener
      httpServer.closeIdleConnections();
      await Promise.allSettled([pub.quit(), sub.quit()]); // 4: Redis
      await db.$disconnect(); //                              5: Prisma
      process.exit(exitCode);
    } catch (err) {
      logger.error({ event: "shutdown_error", err }, "error during shutdown");
      process.exit(1);
    }
  }
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Socket.IO's Redis adapter publishes without awaiting; a Redis outage can surface as an
  // unhandled rejection. Those must be logged, not crash a server whose DB is healthy.
  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (
      /redis|ioredis|connection is closed|ECONNRESET|ETIMEDOUT|max retries/i.test(
        message,
      )
    ) {
      logger.error(
        { event: "redis_error", op: "unhandledRejection", err: message },
        "redis operation failed",
      );
      return;
    }
    logger.fatal(
      { event: "unhandled_rejection", err: reason },
      "unhandled rejection",
    );
    void shutdown("unhandledRejection", 1);
  });
}

main().catch((err) => {
  // Logger may not exist yet (env validation failed): print plainly, without secrets.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
