import { memo, useEffect, useRef, useState } from "react";
import { cellLabel } from "@gridboard/shared";
import { cn } from "@/lib/utils";
import { useBoardStore } from "@/store/board";
import { useClockStore } from "@/store/clock";
import { useViewStore } from "@/store/view";
import { CELL_PX } from "./constants";

interface Props {
  id: number;
  row: number;
  column: number;
}

/**
 * One cell = one tiny subscription. A CELLS_CLAIMED batch entry replaces exactly one entry in the
 * store, so exactly one <Cell> re-renders (its selector output changed); the other 2,499 are
 * skipped by Zustand's reference check and by memo().
 */
export const Cell = memo(function Cell({ id, row, column }: Props) {
  // An optimistic claim (yours, not yet confirmed) takes precedence over what the server last told us, like a
  // like button that fills the heart before the request returns. It is dropped again if the claim fails.
  const pendingCell = useBoardStore((s) => s.pending[id]);
  const confirmed = useBoardStore((s) => s.cells[id]);
  const cell = pendingCell ?? confirmed;
  const owner = useBoardStore((s) => (cell ? s.owners[cell.ownerId] : undefined));
  const mine = useBoardStore((s) => !!cell && cell.ownerId === s.selfId);
  const failedAt = useBoardStore((s) => s.failedAt[id]);
  const focused = useViewStore((s) => s.focusedId === id);
  const locked = useClockStore((s) => !!cell && cell.lockedUntil !== null && cell.lockedUntil > s.now + useBoardStore.getState().clockOffsetMs);

  // Play the pop only for changes that happen while mounted (not for the initial paint).
  const seenVersion = useRef(cell?.version ?? 0);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (cell && cell.version > seenVersion.current) {
      seenVersion.current = cell.version;
      setPop(true);
      const t = setTimeout(() => setPop(false), 560);
      return () => clearTimeout(t);
    }
  }, [cell]);

  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (!failedAt) return;
    setShake(true);
    const t = setTimeout(() => setShake(false), 560);
    return () => clearTimeout(t);
  }, [failedAt]);

  const label = cellLabel(row, column);
  const status = cell
    ? `owned by ${owner?.displayName ?? "another player"}${mine ? " (you)" : ""}${locked ? ", locked" : ""}`
    : "available";

  return (
    <button
      type="button"
      id={`cell-${id}`}
      data-cell={id}
      tabIndex={focused ? 0 : -1}
      aria-label={`Cell ${label}, ${status}`}
      style={{
        width: CELL_PX,
        height: CELL_PX,
        backgroundColor: cell && owner ? owner.color : undefined,
      }}
      className={cn(
        "relative block rounded-[3px] border border-transparent bg-cell p-0 transition-colors duration-150",
        !cell && "hover:bg-cell-hover",
        cell && "border-transparent",
        // lock = a light inner ring; own cells get a centre dot so ownership isn't colour-only
        locked && "shadow-[inset_0_0_0_2px_rgb(255_255_255/0.55)]",
        pop && "cell-pop",
        shake && "cell-shake",
      )}
    >
      {mine && <span aria-hidden className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]" />}
    </button>
  );
});
