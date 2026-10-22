import type { CellDTO, OwnerDTO } from "@gridboard/shared";

interface CellRow {
  id: number;
  row: number;
  column: number;
  ownerId: string | null;
  claimedAt: Date | null;
  lockedUntil: Date | null;
  version: number;
}

export const toCellDTO = (c: CellRow): CellDTO => ({
  id: c.id,
  row: c.row,
  column: c.column,
  ownerId: c.ownerId,
  claimedAt: c.claimedAt?.toISOString() ?? null,
  lockedUntil: c.lockedUntil?.toISOString() ?? null,
  version: c.version,
});

export const toOwnerDTO = (u: { id: string; displayName: string; color: string }): OwnerDTO => ({
  id: u.id,
  displayName: u.displayName,
  color: u.color,
});
