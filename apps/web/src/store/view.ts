import { create } from "zustand";
import { clampPan, fitView, zoomAt, type View } from "@/lib/viewport";

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline";

interface ViewState extends View {
  hoverId: number | null;
  focusedId: number;
  status: ConnectionStatus;
  viewport: { w: number; h: number };
  setView: (v: View) => void;
  setViewport: (w: number, h: number, boardW: number, boardH: number) => void;
  zoomBy: (factor: number, px?: number, py?: number, boardW?: number, boardH?: number) => void;
  reset: (boardW: number, boardH: number) => void;
  setHover: (id: number | null) => void;
  setFocused: (id: number) => void;
  setStatus: (s: ConnectionStatus) => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  scale: 1,
  x: 0,
  y: 0,
  hoverId: null,
  focusedId: 1,
  status: "connecting",
  viewport: { w: 0, h: 0 },
  setView: (v) => set({ scale: v.scale, x: v.x, y: v.y }),
  setViewport: (w, h, boardW, boardH) => {
    const first = get().viewport.w === 0;
    set({ viewport: { w, h }, ...(first ? fitView(boardW, boardH, w, h) : {}) });
  },
  zoomBy: (factor, px, py, boardW = 950, boardH = 950) => {
    const { scale, x, y, viewport } = get();
    const cx = px ?? viewport.w / 2;
    const cy = py ?? viewport.h / 2;
    const next = clampPan(zoomAt({ scale, x, y }, factor, cx, cy), boardW, boardH, viewport.w, viewport.h);
    set({ scale: next.scale, x: next.x, y: next.y });
  },
  reset: (boardW, boardH) => {
    const { viewport } = get();
    set({ ...fitView(boardW, boardH, viewport.w, viewport.h) });
  },
  setHover: (id) => (get().hoverId === id ? undefined : set({ hoverId: id })),
  setFocused: (id) => (get().focusedId === id ? undefined : set({ focusedId: id })),
  setStatus: (status) => set({ status }),
}));
