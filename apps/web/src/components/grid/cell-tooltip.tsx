import { useLayoutEffect, useRef } from "react";
import { cellLabel, positionFromCellId } from "@gridboard/shared";
import { useServerNow } from "@/hooks/useServerNow";
import { serverNow, useBoardStore } from "@/store/board";
import { useViewStore } from "@/store/view";

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

/**
 * Visual tooltip for hover/focus. Each cell's aria-label already carries the same facts, so this
 * is aria-hidden to avoid double announcements. Placement is written straight to the element
 * (the DOM is the external system here), which avoids a render per pan frame.
 */
export function CellTooltip() {
  const hoverId = useViewStore((s) => s.hoverId);
  // Re-anchor when the board moves under a stationary pointer.
  const scale = useViewStore((s) => s.scale);
  const x = useViewStore((s) => s.x);
  const y = useViewStore((s) => s.y);
  const cell = useBoardStore((s) => (hoverId ? (s.pending[hoverId] ?? s.cells[hoverId]) : undefined));
  const owner = useBoardStore((s) => (cell ? s.owners[cell.ownerId] : undefined));
  const now = useServerNow(250);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const tip = ref.current;
    const target = hoverId ? document.getElementById(`cell-${hoverId}`) : null;
    if (!tip) return;
    if (!target) {
      tip.style.visibility = "hidden";
      return;
    }
    const r = target.getBoundingClientRect();
    const flip = r.top < 90; // not enough room above: show below the cell
    const left = Math.min(Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2), window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${flip ? r.bottom + 8 : r.top - 8}px`;
    tip.style.transform = flip ? "" : "translateY(-100%)";
    tip.style.visibility = "visible";
  }, [hoverId, cell?.version, scale, x, y]);

  if (!hoverId) return null;
  const { row, column } = positionFromCellId(hoverId);
  const lockedFor = cell?.lockedUntil ? cell.lockedUntil - now : 0;

  return (
    <div
      ref={ref}
      aria-hidden
      style={{ visibility: "hidden" }}
      className="pointer-events-none fixed z-40 min-w-36 rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg"
    >
      <div className="font-semibold">Cell {cellLabel(row, column)}</div>
      {!cell ? (
        <div className="mt-0.5 text-muted">Available<br />Click to claim</div>
      ) : (
        <div className="mt-0.5 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: owner?.color }} />
            {lockedFor > 0 ? `Owned by ${owner?.displayName}` : owner?.displayName}
          </div>
          <div className="text-muted">
            {lockedFor > 0 ? `Locked for ${Math.ceil(lockedFor / 1000)}s` : `Claimed ${ago(serverNow() - cell.claimedAt)}`}
          </div>
        </div>
      )}
    </div>
  );
}
