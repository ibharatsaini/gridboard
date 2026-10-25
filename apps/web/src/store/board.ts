import type { GridDTO, OwnerDTO } from "@gridboard/shared";
import { create } from "zustand";
import { applyCellUpdate, applyCellUpdates, mergeSnapshot, type CellMap, type CellState } from "@/lib/board-model";

/**
 * Zustand owns ONLY what must update at cell granularity or never touches the server:
 * normalised cells, owners, optimistic claims, and the clock offset.
 * Collections (leaderboard, stats, activity, session) live in the TanStack Query cache.
 */
interface BoardState {
  rows: number;
  columns: number;
  loaded: boolean;
  selfId: string | null;
  cells: CellMap; // claimed cells only; absent id === available
  owners: Record<string, OwnerDTO>;
  pending: Record<number, CellState>; // optimistic claims: shown at once, dropped if the server says no
  failedAt: Record<number, number>; // drives the failed-claim shake
  clockOffsetMs: number; // server - client
  hydrate: (grid: GridDTO) => void;
  applyCell: (cell: CellState, owner?: OwnerDTO) => void;
  /** A realtime batch: ONE store update for any number of claims, so subscribers are notified once. */
  applyCells: (cells: readonly CellState[], owners?: Record<string, OwnerDTO>) => void;
  /** Show `cell` as claimed right now (optimistic), or pass null to take it back. Also registers the owner's colour/name. */
  setPending: (id: number, cell: CellState | null, owner?: OwnerDTO) => void;
  markFailed: (id: number) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  rows: 50,
  columns: 50,
  loaded: false,
  selfId: null,
  cells: {},
  owners: {},
  pending: {},
  failedAt: {},
  clockOffsetMs: 0,
  hydrate: (grid) =>
    set((s) => ({
      rows: grid.rows,
      columns: grid.columns,
      loaded: true,
      cells: mergeSnapshot(s.cells, grid.cells),
      owners: { ...s.owners, ...grid.owners },
      clockOffsetMs: Date.parse(grid.serverTime) - Date.now(),
    })),
  applyCell: (cell, owner) =>
    set((s) => {
      const cells = applyCellUpdate(s.cells, cell);
      const owners = owner && !s.owners[owner.id] ? { ...s.owners, [owner.id]: owner } : s.owners;
      return cells === s.cells && owners === s.owners ? s : { cells, owners };
    }),
  applyCells: (updates, newOwners) =>
    set((s) => {
      const cells = applyCellUpdates(s.cells, updates);
      let owners = s.owners;
      for (const o of Object.values(newOwners ?? {})) {
        if (!owners[o.id]) owners = { ...owners, [o.id]: o };
      }
      return cells === s.cells && owners === s.owners ? s : { cells, owners };
    }),
  setPending: (id, cell, owner) =>
    set((s) => {
      if (!cell && !s.pending[id]) return s;
      const pending = { ...s.pending };
      if (cell) pending[id] = cell;
      else delete pending[id];
      const owners = cell && owner && !s.owners[owner.id] ? { ...s.owners, [owner.id]: owner } : s.owners;
      return { pending, owners };
    }),
  markFailed: (id) => set((s) => ({ failedAt: { ...s.failedAt, [id]: Date.now() } })),
}));

export const serverNow = () => Date.now() + useBoardStore.getState().clockOffsetMs;
