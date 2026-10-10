import {
  CELL_LOCK_MS,
  CLAIM_COOLDOWN_MS,
  cellLabel,
  type CellDTO,
  type ErrorCode,
  type OwnerDTO,
} from "@gridboard/shared";
import type { Logger } from "../config/logger";
import { Prisma, type Db } from "../lib/prisma";
import { cooldownRemainingMs } from "../lib/cooldown";
import type { CellGate } from "../redis/cell-gate";
import type { CooldownStore } from "../redis/cooldown-store";
import { toCellDTO, toOwnerDTO } from "./board.service";

export type ClaimResult =
  | {
      success: true;
      cell: CellDTO;
      owner: OwnerDTO;
      previousOwnerId: string | null;
      label: string;
      lastClaimAt: Date;
    }
  | ClaimFailure;

export type ClaimFailure = {
  success: false;
  code: Extract<ErrorCode, "CELL_ALREADY_CLAIMED" | "CELL_LOCKED" | "CLAIM_COOLDOWN" | "CELL_NOT_FOUND">;
  /** Milliseconds until a retry can succeed (cooldown / lock). */
  retryAfterMs?: number;
  owner?: OwnerDTO;
  lockedUntil?: string;
};

export interface ClaimRules {
  cooldownMs: number;
  lockMs: number;
}

export const DEFAULT_CLAIM_RULES: ClaimRules = { cooldownMs: CLAIM_COOLDOWN_MS, lockMs: CELL_LOCK_MS };

const OWNER_SELECT = { id: true, displayName: true, color: true } as const;

const isRecordNotFound = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";


export class ClaimService {
  constructor(
    private readonly db: Db,
    private readonly cooldowns: CooldownStore,
    private readonly gate: CellGate,
    private readonly logger: Logger,
    /** Injectable so tests can use millisecond-scale windows; production uses the shared constants. */
    private readonly rules: ClaimRules = DEFAULT_CLAIM_RULES,
  ) {}

  async claim(userId: string, cellId: number): Promise<ClaimResult> {
    const reservation = await this.cooldowns.acquire(userId);
    if (!reservation.acquired) {
      return { success: false, code: "CLAIM_COOLDOWN", retryAfterMs: reservation.remainingMs };
    }

    let entered = false;
    let succeeded = false;
    try {
      // Redis per-cell gate: only one claimant at a time proceeds to Postgres for this cell.
      entered = await this.gate.enter(cellId, userId);
      const result = entered ? await this.execute(userId, cellId) : await this.explainLostRace(userId, cellId);
      succeeded = result.success;
      // A rejected claim must not cost the player their cooldown.
      if (!result.success) await this.cooldowns.release(userId);
      return result;
    } catch (err) {
      await this.cooldowns.release(userId);
      throw err;
    } finally {
      // On success the cell is now locked for everyone else anyway, so the response need not wait for
      // Redis to confirm the release (leave() never rejects; the gate also expires on its own).
      // On failure we wait, so an immediate retry by someone else is not turned away by a stale gate.
      if (entered) {
        const released = this.gate.leave(cellId, userId);
        if (!succeeded) await released;
      }
    }
  }

  private async execute(userId: string, cellId: number): Promise<ClaimResult> {
    // One timestamp per attempt. (Application clock: with several API instances, clock skew can shift a
    // lock/cooldown edge by the skew; it can never change who wins a race, which is decided by `version`.)
    const now = new Date();

    // 2. Pre-checks, in parallel (no writes yet).
    const [cell, user] = await Promise.all([
      this.db.cell.findUnique({ where: { id: cellId }, include: { owner: { select: OWNER_SELECT } } }),
      this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { ...OWNER_SELECT, lastClaimAt: true } }),
    ]);
    if (!cell) return { success: false, code: "CELL_NOT_FOUND" };
    const rejection = this.rejectionFor(cell, userId, now);
    if (rejection) return rejection;

    // 3. Atomic cooldown check-and-stamp. The WHERE clause IS the durable cooldown rule.
    const stamp = await this.db.user.updateMany({
      where: {
        id: userId,
        OR: [{ lastClaimAt: null }, { lastClaimAt: { lte: new Date(now.getTime() - this.rules.cooldownMs) } }],
      },
      data: { lastClaimAt: now },
    });
    if (stamp.count === 0) {
      const fresh = await this.db.user.findUnique({ where: { id: userId }, select: { lastClaimAt: true } });
      return {
        success: false,
        code: "CLAIM_COOLDOWN",
        retryAfterMs: cooldownRemainingMs(fresh?.lastClaimAt ?? user.lastClaimAt, new Date(), this.rules.cooldownMs),
      };
    }

    // 4. The atomic claim (CAS on version) + history row + feed row in the same nested write.
    try {
      const updated = await this.db.cell.update({
        where: { id: cellId, version: cell.version },
        data: {
          ownerId: userId,
          claimedAt: now,
          lockedUntil: new Date(now.getTime() + this.rules.lockMs),
          version: { increment: 1 },
          claims: {
            create: { userId, previousOwnerId: cell.ownerId, cellVersion: cell.version + 1 },
          },
          activity: { create: { type: "CLAIM", userId } },
        },
      });

      return {
        success: true,
        cell: toCellDTO(updated),
        owner: toOwnerDTO(user),
        previousOwnerId: cell.ownerId,
        label: cellLabel(updated.row, updated.column),
        lastClaimAt: now,
      };
    } catch (err) {
      await this.restoreCooldown(userId, now, user.lastClaimAt);
      if (isRecordNotFound(err)) return this.explainLostRace(userId, cellId);
      throw err;
    }
  }

  /** Why a cell can't be claimed right now, or null if it can. Pure over an already-loaded cell. */
  private rejectionFor(
    cell: { ownerId: string | null; lockedUntil: Date | null; owner: OwnerDTO | null },
    userId: string,
    now: Date,
  ): ClaimFailure | null {
    const owner = cell.owner ? toOwnerDTO(cell.owner) : undefined;
    if (cell.ownerId === userId) return { success: false, code: "CELL_ALREADY_CLAIMED", owner };
    if (cell.ownerId && cell.lockedUntil && cell.lockedUntil.getTime() > now.getTime()) {
      return {
        success: false,
        code: "CELL_LOCKED",
        owner,
        lockedUntil: cell.lockedUntil.toISOString(),
        retryAfterMs: cell.lockedUntil.getTime() - now.getTime(),
      };
    }
    return null;
  }

  /** We lost the compare-and-swap: re-read the winner so the client can show who beat them. */
  private async explainLostRace(userId: string, cellId: number): Promise<ClaimFailure> {
    const cell = await this.db.cell.findUnique({ where: { id: cellId }, include: { owner: { select: OWNER_SELECT } } });
    if (!cell) return { success: false, code: "CELL_NOT_FOUND" };
    return (
      this.rejectionFor(cell, userId, new Date()) ?? {
        success: false,
        code: "CELL_ALREADY_CLAIMED",
        owner: cell.owner ? toOwnerDTO(cell.owner) : undefined,
      }
    );
  }

  /**
   * Compare-and-swap the cooldown stamp back, but only if it is still the one we wrote. If the restore
   * itself fails the player just waits out one extra cooldown (bounded, self-healing), so we log and move on.
   */
  private async restoreCooldown(userId: string, stampedAt: Date, previous: Date | null): Promise<void> {
    try {
      await this.db.user.updateMany({ where: { id: userId, lastClaimAt: stampedAt }, data: { lastClaimAt: previous } });
    } catch (err) {
      this.logger.error({ event: "database_error", op: "cooldown.restore", userId, err }, "could not restore cooldown stamp");
    }
  }
}
