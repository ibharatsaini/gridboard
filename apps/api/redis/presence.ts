import type { Logger } from "../config/logger";
import type { RedisPort } from "./types";

const KEY = "gb:presence";
/** A socket that stops refreshing disappears from the count after this long. */
export const PRESENCE_TTL_MS = 45_000;
export const PRESENCE_REFRESH_MS = 15_000;

/**
 * Approximate online presence shared across API instances.
 *
 * One sorted set; member = "<userId>|<instanceId>:<socketId>", score = expiry (epoch ms).
 *  - Each instance re-scores ITS sockets with a single batched ZADD every 15s.
 *  - Disconnect removes the member immediately.
 *  - If an instance crashes its members simply stop being refreshed and age out within 45s,
 *    so there are no permanently stale entries and no cleanup job.
 *  - "Online" counts DISTINCT users, so several tabs/devices of one user count once.
 *
 * Trade-off: counts can lag real life by up to the TTL after a hard crash, and the distinct
 * count reads every live member (fine for thousands; see docs for the HyperLogLog/sharded option).
 */
export class PresenceService {
  private readonly local = new Map<string, string>(); // socketId -> member
  private lastKnown = 0;

  constructor(
    private readonly redis: RedisPort,
    private readonly instanceId: string,
    private readonly logger: Logger,
  ) {}

  async register(socketId: string, userId: string): Promise<void> {
    const member = `${userId}|${this.instanceId}:${socketId}`;
    this.local.set(socketId, member);
    await this.safe("presence.register", () =>
      this.redis.zaddMany(KEY, [{ member, score: Date.now() + PRESENCE_TTL_MS }]),
    );
  }

  async unregister(socketId: string): Promise<void> {
    const member = this.local.get(socketId);
    if (!member) return;
    this.local.delete(socketId);
    await this.safe("presence.unregister", () => this.redis.zrem(KEY, [member]));
  }

  /** One round trip for all local sockets, regardless of how many. */
  async refresh(): Promise<void> {
    if (this.local.size === 0) return;
    const score = Date.now() + PRESENCE_TTL_MS;
    await this.safe("presence.refresh", () =>
      this.redis.zaddMany(KEY, [...this.local.values()].map((member) => ({ member, score }))),
    );
  }

  async countOnline(): Promise<number> {
    try {
      const now = Date.now();
      await this.redis.zremBelow(KEY, now);
      const members = await this.redis.zmembersFrom(KEY, now);
      this.lastKnown = new Set(members.map((m) => m.slice(0, m.indexOf("|")))).size;
    } catch (err) {
      this.logger.error({ event: "redis_error", op: "presence.count", err }, "presence unavailable; serving last known value");
    }
    return this.lastKnown;
  }

  get localSockets(): number {
    return this.local.size;
  }

  private async safe(op: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      this.logger.error({ event: "redis_error", op, err }, "presence write failed");
    }
  }
}
