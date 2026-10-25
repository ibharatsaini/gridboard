import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { CELL_LOCK_MS, CLAIM_COOLDOWN_MS, positionFromCellId, type OwnerDTO, type SessionDTO } from "@gridboard/shared";
import { ApiError, api } from "@/lib/api";
import { isLocked, toCellState, type CellState } from "@/lib/board-model";
import { keys, reconcile } from "@/lib/queries";
import { serverNow, useBoardStore } from "@/store/board";

/**
 * Claiming works like an Instagram like: the cell turns yours the instant you click, the request goes out in the
 * background, and if the server says no the cell is put back and you are told why.
 *
 * The optimistic cell lives in `pending`, separate from the confirmed `cells` map, so rolling back is just deleting
 * that entry. The server stays the judge: confirmed ownership only ever comes from its response or a socket event.
 */
export function useClaim() {
  const qc = useQueryClient();

  return useCallback(
    async (id: number) => {
      const board = useBoardStore.getState();
      if (board.pending[id]) return;
      const { row, column } = positionFromCellId(id);
      const real = board.cells[id];
      const wasAvailable = !real;

      // UX only: the server enforces the cooldown regardless of what we do here.
      const me = qc.getQueryData<SessionDTO>(keys.me);
      const until = me?.stats.cooldownUntil ? Date.parse(me.stats.cooldownUntil) : 0;
      if (until > serverNow()) {
        board.markFailed(id);
        toast.message(`Wait ${((until - serverNow()) / 1000).toFixed(1)}s before claiming again.`, { id: "cooldown" });
        return;
      }

      // 1. Show it as yours immediately. Skipped when we already know the server will refuse (locked by someone else,
      //    or already ours), so the cell never flashes yours and snaps back for a sure loss.
      const optimistic = !!me && real?.ownerId !== me.user.id && !isLocked(real, serverNow());
      const previousCooldown = me?.stats.cooldownUntil ?? null;
      if (optimistic && me) {
        const now = serverNow();
        const guess: CellState = {
          id, row, column,
          ownerId: me.user.id,
          claimedAt: now,
          lockedUntil: now + CELL_LOCK_MS,
          version: (real?.version ?? 0) + 1,
        };
        board.setPending(id, guess, { id: me.user.id, displayName: me.user.displayName, color: me.user.color });
        // Start the cooldown meter now too, so a second click in the next few hundred ms is stopped locally.
        qc.setQueryData<SessionDTO>(keys.me, (old) =>
          old ? { ...old, stats: { ...old.stats, cooldownUntil: new Date(now + CLAIM_COOLDOWN_MS).toISOString() } } : old,
        );
      } else {
        board.setPending(id, null);
      }

      try {
        const res = await api.claim(id);
        const cell = toCellState(res.cell);
        if (cell) useBoardStore.getState().applyCell(cell, res.owner); // confirmed truth replaces the guess
        qc.setQueryData<SessionDTO>(keys.me, (old) => (old ? { ...old, stats: res.stats } : old));
      } catch (err) {
        // 2. Roll back: forget the guess, restore the cooldown meter, shake the cell.
        useBoardStore.getState().setPending(id, null);
        if (optimistic) {
          qc.setQueryData<SessionDTO>(keys.me, (old) =>
            old ? { ...old, stats: { ...old.stats, cooldownUntil: previousCooldown } } : old,
          );
        }
        useBoardStore.getState().markFailed(id);
        if (!(err instanceof ApiError)) throw err;
        switch (err.code) {
          case "CELL_LOCKED":
          case "CELL_ALREADY_CLAIMED": {
            const owner = err.details?.owner as OwnerDTO | undefined;
            toast.error(wasAvailable && owner ? `${owner.displayName} just beat you to that cell.` : err.message, { id: `conflict-${id}` });
            // Heal even if the socket is down: fetch just this cell (merged by version).
            api.cell(id).then((d) => {
              const c = toCellState(d.cell);
              if (c) useBoardStore.getState().applyCell(c, d.owner ?? undefined);
            }).catch(() => undefined);
            break;
          }
          case "CLAIM_COOLDOWN": {
            // The server knows the true remaining time; show it on the meter instead of the guess we rolled back to.
            const retry = typeof err.details?.retryAfterMs === "number" ? err.details.retryAfterMs : 0;
            if (retry > 0) {
              qc.setQueryData<SessionDTO>(keys.me, (old) =>
                old ? { ...old, stats: { ...old.stats, cooldownUntil: new Date(serverNow() + retry).toISOString() } } : old,
              );
            }
            toast.message(err.message, { id: "cooldown" });
            break;
          }
          case "RATE_LIMITED":
            toast.warning("Too many clicks. Take a breath.", { id: "ratelimit" });
            break;
          case "UNAUTHORIZED":
            void qc.invalidateQueries({ queryKey: keys.me });
            break;
          case "NETWORK_ERROR":
            toast.error("Couldn't reach the server. Reconciling…");
            reconcile(qc).catch(() => undefined);
            break;
          default:
            toast.error(err.message);
        }
      }
    },
    [qc],
  );
}
