import type { Logger } from "../config/logger";
import type { RedisPort } from "./types";

export type CooldownReservation =
  | { acquired: true; degraded: boolean }
  | { acquired: false; remainingMs: number };

/**
 * Redis FAST PATH for the claim cooldown.
 *
 * acquire() is a single atomic `SET key NX PX ttl`: two simultaneous requests from
 * one user cannot both reserve it, and rejected requests never touch Postgres.
 *
 * It is NOT the source of truth. If Redis is down (or was flushed) the claim
 * transaction still enforces the cooldown from users.last_claim_at, so the worst
 * case of a Redis failure is extra DB load, never a bypassed cooldown.
 */
export class CooldownStore {
  constructor(
    private readonly redis: RedisPort,
    private readonly cooldownMs: number,
    private readonly logger: Logger,
  ) {}

  private key(userId: string) {
    return `gb:cd:${userId}`;
  }

  async acquire(userId: string): Promise<CooldownReservation> {
    try {
      if (await this.redis.setNx(this.key(userId), this.cooldownMs)) return { acquired: true, degraded: false };
      return { acquired: false, remainingMs: await this.redis.ttlMs(this.key(userId)) };
    } catch (err) {
      this.logger.error({ event: "redis_error", op: "cooldown.acquire", err }, "cooldown store unavailable; DB guard will enforce");
      return { acquired: true, degraded: true };
    }
  }

  /** Give the reservation back when the claim did not succeed, so a lost race costs nothing. */
  async release(userId: string): Promise<void> {
    try {
      await this.redis.del(this.key(userId));
    } catch {
      // Best effort: the reservation expires on its own.
    }
  }
}
