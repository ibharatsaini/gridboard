import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { cellLabel, positionFromCellId, type OwnerDTO, type SessionDTO } from "@gridboard/shared";
import { ApiError, api } from "@/lib/api";
import { toCellState } from "@/lib/board-model";
import { keys, reconcile } from "@/lib/queries";
import { serverNow, useBoardStore } from "@/store/board";

/**
 * Optimistic claiming. The "CLAIMING" flag is a UI hint only: ownership is written to the
 * store exclusively from server-confirmed data (the response or a socket event).
 */
export function useClaim() {
  const qc = useQueryClient();

  return useCallback(
    async (id: number) => {
      const board = useBoardStore.getState();
      if (board.pending[id]) return;
      const { row, column } = positionFromCellId(id);
      const label = cellLabel(row, column);
      const wasAvailable = !board.cells[id];

      // UX only: the server enforces the cooldown regardless of what we do here.
      const me = qc.getQueryData<SessionDTO>(keys.me);
      const until = me?.stats.cooldownUntil ? Date.parse(me.stats.cooldownUntil) : 0;
      if (until > serverNow()) {
        board.markFailed(id);
        toast.message(`Wait ${((until - serverNow()) / 1000).toFixed(1)}s before claiming again.`, { id: "cooldown" });
        return;
      }

      board.setPending(id, true);
      try {
        const res = await api.claim(id);
        const cell = toCellState(res.cell);
        if (cell) useBoardStore.getState().applyCell(cell, res.owner);
        qc.setQueryData<SessionDTO>(keys.me, (old) => (old ? { ...old, stats: res.stats } : old));
        toast.success(`Cell ${label} claimed`, { id: `claim-${id}` });
      } catch (err) {
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
          case "CLAIM_COOLDOWN":
            toast.message(err.message, { id: "cooldown" });
            break;
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
      } finally {
        useBoardStore.getState().setPending(id, false);
      }
    },
    [qc],
  );
}
