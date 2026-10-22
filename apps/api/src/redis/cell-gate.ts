import type { Logger } from "../config/logger";
import type { RedisPort } from "./types";

/**
 * Redis FAST PATH for claiming a cell: a short-lived per-cell mutex (`SET NX PX`, compare-and-delete release).
 *
 * Of N simultaneous claimants of one cell, Redis admits exactly one into the database path; the rest are
 * turned away in one round trip without touching Postgres. That is what makes hot-cell contention cheap.
 *
 * It is NOT the source of truth. Ownership is only ever written by the Postgres version compare-and-swap,
 * so if Redis is down, flushed, or the gate expires mid-claim, the worst outcome is that more claimants
 * reach Postgres and all but one lose there. A Redis failure can never produce two owners.
 */
export class CellGate {
  constructor(
    private readonly redis: RedisPort,
    /** Upper bound on how long one claim may hold the gate (crash safety); normally released in ms. */
    private readonly holdMs: number,
    private readonly logger: Logger,
  ) {}

  private key(cellId: number) {
    return `gb:cell:${cellId}`;
  }

  /** true = you may proceed (or Redis is unavailable, so Postgres decides); false = someone else is mid-claim. */
  async enter(cellId: number, userId: string): Promise<boolean> {
    try {
      return await this.redis.lock(this.key(cellId), userId, this.holdMs);
    } catch (err) {
      this.logger.error({ event: "redis_error", op: "cellgate.enter", err }, "cell gate unavailable; DB compare-and-swap will decide");
      return true;
    }
  }

  async leave(cellId: number, userId: string): Promise<void> {
    try {
      await this.redis.unlock(this.key(cellId), userId);
    } catch {
      // Best effort: the gate expires on its own.
    }
  }
}
