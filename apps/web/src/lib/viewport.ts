export interface View {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 4;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Zoom by `factor` keeping the board point under (px, py) fixed on screen. */
export function zoomAt(view: View, factor: number, px: number, py: number, min = MIN_SCALE, max = MAX_SCALE): View {
  const scale = clamp(view.scale * factor, min, max);
  if (scale === view.scale) return view;
  const ratio = scale / view.scale;
  return { scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}

/** Keep at least `margin` px of the board on screen so it can never be lost off-canvas. */
export function clampPan(view: View, boardW: number, boardH: number, viewW: number, viewH: number, margin = 80): View {
  const w = boardW * view.scale;
  const h = boardH * view.scale;
  return {
    scale: view.scale,
    x: clamp(view.x, margin - w, viewW - margin),
    y: clamp(view.y, margin - h, viewH - margin),
  };
}

/** Default view: whole board visible and centred, with padding. */
export function fitView(boardW: number, boardH: number, viewW: number, viewH: number, pad = 16): View {
  const scale = clamp(Math.min((viewW - pad * 2) / boardW, (viewH - pad * 2) / boardH), MIN_SCALE, 1.5);
  return { scale, x: (viewW - boardW * scale) / 2, y: (viewH - boardH * scale) / 2 };
}

export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
