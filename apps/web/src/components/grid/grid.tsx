import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { positionFromCellId } from "@gridboard/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { useClaim } from "@/hooks/useClaim";
import { clampPan, distance, zoomAt, type View } from "@/lib/viewport";
import { useBoardStore } from "@/store/board";
import { useClockStore } from "@/store/clock";
import { useViewStore } from "@/store/view";
import { Cell } from "./cell";
import { CellTooltip } from "./cell-tooltip";
import { boardSize } from "./constants";
import { ZoomControls } from "./zoom-controls";

const DRAG_THRESHOLD_MOUSE = 5;
const DRAG_THRESHOLD_TOUCH = 10;

const cellIdOf = (el: EventTarget | null): number | null => {
  const hit = (el as HTMLElement | null)?.closest?.("[data-cell]") as HTMLElement | null;
  return hit ? Number(hit.dataset.cell) : null;
};

export function Grid() {
  const rows = useBoardStore((s) => s.rows);
  const columns = useBoardStore((s) => s.columns);
  const loaded = useBoardStore((s) => s.loaded);
  const claim = useClaim();

  const scale = useViewStore((s) => s.scale);
  const x = useViewStore((s) => s.x);
  const y = useViewStore((s) => s.y);
  const [dragging, setDragging] = useState(false);

  const boardW = boardSize(columns);
  const boardH = boardSize(rows);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Static list of cells: never changes, so the grid markup is created once.
  const cells = useMemo(
    () => Array.from({ length: rows * columns }, (_, i) => ({ id: i + 1, row: Math.floor(i / columns), column: i % columns })),
    [rows, columns],
  );

  // Track viewport size; the first measurement also sets the default "fit" view.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      useViewStore.getState().setViewport(r.width, r.height, boardW, boardH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [boardW, boardH]);

  // Shared clock for lock rings (one timer for the whole board).
  useEffect(() => {
    const id = setInterval(() => useClockStore.setState({ now: Date.now() }), 500);
    return () => clearInterval(id);
  }, []);

  // Wheel zoom must be a non-passive native listener to preventDefault page scroll.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      useViewStore.getState().zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top, boardW, boardH);
      useViewStore.getState().setHover(null);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [boardW, boardH]);

  // ---- Pointer gestures: pan (1 pointer), pinch (2 pointers), click vs drag ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startView: View;
    startPoint: { x: number; y: number };
    downCell: number | null;
    moved: boolean;
    threshold: number;
    pinch?: { dist: number; mid: { x: number; y: number } };
  } | null>(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const currentView = (): View => {
    const { scale, x, y } = useViewStore.getState();
    return { scale, x, y };
  };
  const commit = (v: View) => {
    const { viewport, setView } = useViewStore.getState();
    setView(clampPan(v, boardW, boardH, viewport.w, viewport.h));
  };

  const onPointerDown = (e: RPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) {
      gesture.current = {
        startView: currentView(),
        startPoint: local(e),
        downCell: cellIdOf(e.target),
        moved: false,
        threshold: e.pointerType === "mouse" ? DRAG_THRESHOLD_MOUSE : DRAG_THRESHOLD_TOUCH,
      };
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current.moved = true; // a second finger is never a tap
      gesture.current.startView = currentView();
      gesture.current.pinch = { dist: distance(a, b) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
  };

  const onPointerMove = (e: RPointerEvent) => {
    const g = gesture.current;
    if (!pointers.current.has(e.pointerId)) {
      // plain hover (mouse)
      if (e.pointerType === "mouse") useViewStore.getState().setHover(cellIdOf(e.target));
      return;
    }
    pointers.current.set(e.pointerId, local(e));
    if (!g) return;

    if (pointers.current.size >= 2 && g.pinch) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(g.startView, distance(a, b) / g.pinch.dist, g.pinch.mid.x, g.pinch.mid.y);
      commit({ ...zoomed, x: zoomed.x + (mid.x - g.pinch.mid.x), y: zoomed.y + (mid.y - g.pinch.mid.y) });
      return;
    }

    const p = local(e);
    const dx = p.x - g.startPoint.x;
    const dy = p.y - g.startPoint.y;
    if (!g.moved && Math.hypot(dx, dy) > g.threshold) {
      g.moved = true; // from here on this gesture is a pan and can no longer claim a cell
      setDragging(true);
      useViewStore.getState().setHover(null);
      viewportRef.current?.setPointerCapture(e.pointerId);
    }
    if (g.moved) commit({ scale: g.startView.scale, x: g.startView.x + dx, y: g.startView.y + dy });
  };

  const endPointer = (e: RPointerEvent, cancelled = false) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (g && !g.moved && !cancelled && g.downCell !== null) {
        useViewStore.getState().setFocused(g.downCell);
        void claim(g.downCell);
      }
      gesture.current = null;
      setDragging(false);
    } else if (g) {
      // one finger lifted from a pinch: continue as a pan from the remaining finger
      const [rest] = [...pointers.current.values()];
      g.pinch = undefined;
      g.startView = currentView();
      g.startPoint = rest!;
    }
  };

  // ---- Keyboard model: roving tabindex, arrows move, Enter/Space claims ----
  const focusCell = (id: number) => {
    const el = document.getElementById(`cell-${id}`);
    useViewStore.getState().setFocused(id);
    el?.focus({ preventScroll: true });
    // pan just enough to keep the focused cell visible
    const vp = viewportRef.current?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    if (vp && r) {
      const pad = 24;
      const dx = r.left < vp.left + pad ? vp.left + pad - r.left : r.right > vp.right - pad ? vp.right - pad - r.right : 0;
      const dy = r.top < vp.top + pad ? vp.top + pad - r.top : r.bottom > vp.bottom - pad ? vp.bottom - pad - r.bottom : 0;
      if (dx || dy) commit({ ...currentView(), x: currentView().x + dx, y: currentView().y + dy });
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const id = cellIdOf(e.target);
    const view = useViewStore.getState();
    if (e.key === "+" || e.key === "=") return void view.zoomBy(1.25, undefined, undefined, boardW, boardH);
    if (e.key === "-") return void view.zoomBy(0.8, undefined, undefined, boardW, boardH);
    if (e.key === "0") return void view.reset(boardW, boardH);
    if (id === null) return;
    const { row, column } = positionFromCellId(id, columns);
    const move: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const m = move[e.key];
    if (m) {
      e.preventDefault();
      const r = Math.min(rows - 1, Math.max(0, row + m[0]));
      const c = Math.min(columns - 1, Math.max(0, column + m[1]));
      focusCell(r * columns + c + 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void claim(id);
    }
  };

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
      {/* Event delegation: every interactive element inside is a real <button> cell (roving tabindex); this wrapper
          only receives their bubbling pointer/keyboard events and implements pan/zoom on top of them. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={viewportRef}
        role="group"
        aria-label={`Shared grid, ${rows} by ${columns} cells. Arrow keys move, Enter claims, plus and minus zoom, zero resets.`}
        className="absolute inset-0 touch-none select-none"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e)}
        onPointerCancel={(e) => endPointer(e, true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && useViewStore.getState().setHover(null)}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          const id = cellIdOf(e.target);
          if (id !== null) {
            useViewStore.getState().setFocused(id);
            useViewStore.getState().setHover(id);
          }
        }}
        onBlur={() => useViewStore.getState().setHover(null)}
      >
        {!loaded ? (
          <div className="grid h-full place-items-center p-8" role="status" aria-label="Loading board">
            <Skeleton className="aspect-square w-full max-w-md" />
          </div>
        ) : (
          <div
            style={{
              width: boardW,
              height: boardH,
              transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
              transformOrigin: "0 0",
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, 20px)`,
              gap: 2,
              willChange: "transform",
            }}
          >
            {cells.map((c) => (
              <Cell key={c.id} id={c.id} row={c.row} column={c.column} />
            ))}
          </div>
        )}
      </div>
      {loaded && <ZoomControls />}
      <CellTooltip />
    </div>
  );
}
