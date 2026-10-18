import { positionFromCellId, type CellDiff, type CellDTO } from "@gridboard/shared";

/** Client-side cell: timestamps as epoch ms so rendering never parses strings. */
export interface CellState {
  id: number;
  row: number;
  column: number;
  ownerId: string;
  claimedAt: number;
  lockedUntil: number | null;
  version: number;
}

export type CellMap = Record<number, CellState>;

export function toCellState(dto: CellDTO): CellState | null {
  if (!dto.ownerId) return null;
  return {
    id: dto.id,
    row: dto.row,
    column: dto.column,
    ownerId: dto.ownerId,
    claimedAt: dto.claimedAt ? Date.parse(dto.claimedAt) : 0,
    lockedUntil: dto.lockedUntil ? Date.parse(dto.lockedUntil) : null,
    version: dto.version,
  };
}

/** A slim realtime diff carries no row/column: they are a pure function of the id. */
export function diffToCellState(diff: CellDiff): CellState {
  const { row, column } = positionFromCellId(diff.id);
  return {
    id: diff.id,
    row,
    column,
    ownerId: diff.ownerId,
    claimedAt: Date.parse(diff.claimedAt),
    lockedUntil: diff.lockedUntil ? Date.parse(diff.lockedUntil) : null,
    version: diff.version,
  };
}

/**
 * Applies one cell update only if it is strictly newer than what we hold.
 * Returns the SAME map reference when nothing changed, so duplicate / stale
 * events cause no store update and therefore no re-render.
 */
export function applyCellUpdate(cells: CellMap, next: CellState): CellMap {
  const current = cells[next.id];
  if (current && current.version >= next.version) return cells;
  return { ...cells, [next.id]: next };
}

/** Merges an authoritative snapshot without ever moving a cell backwards in version. */
export function mergeSnapshot(cells: CellMap, snapshot: CellDTO[]): CellMap {
  let out = cells;
  for (const dto of snapshot) {
    const state = toCellState(dto);
    if (state) out = applyCellUpdate(out, state);
  }
  return out;
}

export const isLocked = (cell: CellState | undefined, nowMs: number) =>
  !!cell && cell.lockedUntil !== null && cell.lockedUntil > nowMs;

/** Applies a whole batch in order; returns the SAME map when nothing in it was newer. */
export function applyCellUpdates(cells: CellMap, updates: readonly CellState[]): CellMap {
  let out = cells;
  for (const u of updates) out = applyCellUpdate(out, u);
  return out;
}
