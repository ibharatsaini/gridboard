import { Home, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { useBoardStore } from "@/store/board";
import { useViewStore } from "@/store/view";
import { boardSize } from "./constants";

export function ZoomControls() {
  const scale = useViewStore((s) => s.scale);
  const zoomBy = useViewStore((s) => s.zoomBy);
  const reset = useViewStore((s) => s.reset);
  const { rows, columns } = useBoardStore.getState();
  const w = boardSize(columns);
  const h = boardSize(rows);

  return (
    <div role="toolbar" aria-label="Grid zoom" className="absolute bottom-3 right-3 flex flex-col items-center gap-1 rounded-xl border border-line bg-panel/95 p-1 shadow-md backdrop-blur-sm">
      <Hint label="Zoom in (+)">
        <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => zoomBy(1.25, undefined, undefined, w, h)}><Plus className="size-4" /></Button>
      </Hint>
      <Hint label="Zoom out (−)">
        <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => zoomBy(0.8, undefined, undefined, w, h)}><Minus className="size-4" /></Button>
      </Hint>
      <Hint label="Reset view (0)">
        <Button variant="ghost" size="icon" aria-label="Reset view" onClick={() => reset(w, h)}><Home className="size-4" /></Button>
      </Hint>
      <span className="pb-1 text-[11px] font-medium text-muted" aria-label={`Zoom ${Math.round(scale * 100)} percent`}>{Math.round(scale * 100)}%</span>
    </div>
  );
}
