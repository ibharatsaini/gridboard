import type { LeaderboardUpdatedEvent, OwnerDTO, PresenceUpdatedEvent, RealtimeEvent, StatsUpdatedEvent, UserJoinedEvent, UserStatsUpdatedEvent, CellsClaimedEvent, ClaimDiff } from "@gridboard/shared";
import type { Logger } from "../config/logger";
import { createEvent } from "../lib/events";
import type { PresenceService } from "../redis/presence";
import type { BoardService } from "./board.service";
import type { ClaimResult } from "./claim.service";

/** Where events go. The Socket.IO server implements this; Redis fan-out happens behind it. */
export interface EventEmitter {
  toBoard(event: RealtimeEvent): void;
  toUser(userId: string, event: RealtimeEvent): void;
}

/** Claims arriving within this window leave as one CELLS_CLAIMED message. */
export const DEFAULT_CLAIM_BATCH_MS = 50;
/** A burst this large flushes immediately instead of waiting out the window (bounds message size). */
const MAX_CLAIMS_PER_BATCH = 100;
const SUMMARY_DEBOUNCE_MS = 120;
const SUMMARY_MAX_WAIT_MS = 400;
const PRESENCE_DEBOUNCE_MS = 1000;

/**
 * Turns committed domain changes into realtime events.
 *
 *  - Claims are batched: everything committed within one short window (50 ms by default, flushed early at
 *    100 claims) leaves as ONE slim CELLS_CLAIMED message, so a burst of N claims is one fan-out, not N.
 *  - Stats + leaderboard are recomputed once per burst (trailing debounce with a max wait):
 *    50 claims in 100ms cost one read, not fifty.
 *  - Per-user numbers go only to the two users whose cells changed.
 *
 * Every method swallows+logs errors: by the time we get here the claim is already committed,
 * so a broadcast failure must never turn a successful claim into an API error. Clients that
 * miss an event heal on the next one or on reconnect reconciliation.
 */
export class BroadcastService {
  private summaryTimer: NodeJS.Timeout | null = null;
  private summaryFirstScheduledAt = 0;
  private presenceTimer: NodeJS.Timeout | null = null;

  private pendingClaims: ClaimDiff[] = [];
  private pendingOwners: Record<string, OwnerDTO> = {};
  private pendingAffected = new Set<string>();
  private claimTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly emitter: EventEmitter,
    private readonly board: BoardService,
    private readonly presence: PresenceService,
    private readonly logger: Logger,
    private readonly claimBatchMs: number = DEFAULT_CLAIM_BATCH_MS,
  ) {}

  /** Queue a committed claim. Resolves once it is queued (the flush happens within the batch window). */
  async cellClaimed(result: Extract<ClaimResult, { success: true }>): Promise<void> {
    const { cell } = result;
    this.pendingClaims.push({
      cell: {
        id: cell.id,
        ownerId: result.owner.id,
        claimedAt: cell.claimedAt ?? new Date().toISOString(),
        lockedUntil: cell.lockedUntil,
        version: cell.version,
      },
      previousOwnerId: result.previousOwnerId,
    });
    this.pendingOwners[result.owner.id] = result.owner;
    this.pendingAffected.add(result.owner.id);
    if (result.previousOwnerId) this.pendingAffected.add(result.previousOwnerId);

    if (this.pendingClaims.length >= MAX_CLAIMS_PER_BATCH || this.claimBatchMs <= 0) {
      this.flushClaims();
    } else if (!this.claimTimer) {
      // Fixed window from the FIRST queued claim (not a debounce): worst-case added latency is claimBatchMs.
      this.claimTimer = setTimeout(() => this.flushClaims(), this.claimBatchMs);
      this.claimTimer.unref();
    }
  }

  /** Emit everything queued as a single event, then refresh per-user numbers and the summaries once. */
  flushClaims(): void {
    if (this.claimTimer) clearTimeout(this.claimTimer);
    this.claimTimer = null;
    if (this.pendingClaims.length === 0) return;
    const claims = this.pendingClaims;
    const owners = this.pendingOwners;
    const affected = this.pendingAffected;
    this.pendingClaims = [];
    this.pendingOwners = {};
    this.pendingAffected = new Set();

    try {
      this.emitter.toBoard(createEvent<CellsClaimedEvent>("CELLS_CLAIMED", { claims, owners }));
    } catch (err) {
      this.logger.error({ event: "broadcast_error", type: "CELLS_CLAIMED", err }, "failed to broadcast claims");
    }
    // Once per affected user per batch, not once per claim.
    for (const id of affected) {
      this.pushUserStats(id).catch((err: unknown) =>
        this.logger.error({ event: "broadcast_error", type: "USER_STATS_UPDATED", err }, "failed to push user stats"),
      );
    }
    this.scheduleSummaries();
  }

  userJoined(user: OwnerDTO): void {
    try {
      this.emitter.toBoard(createEvent<UserJoinedEvent>("USER_JOINED", { user }));
    } catch (err) {
      this.logger.error({ event: "broadcast_error", type: "USER_JOINED", err }, "failed to broadcast join");
    }
  }

  schedulePresence(): void {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      void this.publishPresence();
    }, PRESENCE_DEBOUNCE_MS);
    this.presenceTimer.unref();
  }

  async publishPresence(): Promise<void> {
    try {
      const online = await this.presence.countOnline();
      this.emitter.toBoard(createEvent<PresenceUpdatedEvent>("PRESENCE_UPDATED", { online }));
    } catch (err) {
      this.logger.error({ event: "broadcast_error", type: "PRESENCE_UPDATED", err }, "failed to broadcast presence");
    }
  }

  private async pushUserStats(userId: string): Promise<void> {
    const stats = await this.board.getUserStats(userId);
    this.emitter.toUser(userId, createEvent<UserStatsUpdatedEvent>("USER_STATS_UPDATED", stats));
  }

  private scheduleSummaries(): void {
    const now = Date.now();
    if (this.summaryTimer) {
      // Already pending: only push the deadline out while we are under the max wait.
      if (now - this.summaryFirstScheduledAt >= SUMMARY_MAX_WAIT_MS) return;
      clearTimeout(this.summaryTimer);
    } else {
      this.summaryFirstScheduledAt = now;
    }
    this.summaryTimer = setTimeout(() => {
      this.summaryTimer = null;
      void this.publishSummaries();
    }, SUMMARY_DEBOUNCE_MS);
    this.summaryTimer.unref();
  }

  async publishSummaries(): Promise<void> {
    try {
      const { counts, leaderboard } = await this.board.getSummaries();
      this.emitter.toBoard(createEvent<StatsUpdatedEvent>("STATS_UPDATED", counts));
      this.emitter.toBoard(createEvent<LeaderboardUpdatedEvent>("LEADERBOARD_UPDATED", leaderboard));
    } catch (err) {
      this.logger.error({ event: "broadcast_error", type: "SUMMARIES", err }, "failed to broadcast summaries");
    }
  }

  dispose(): void {
    this.flushClaims(); // never drop committed claims on shutdown
    if (this.summaryTimer) clearTimeout(this.summaryTimer);
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
  }
}
