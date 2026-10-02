import { BOARD_COLUMNS } from "./constants";

/** Spreadsheet-style column letters: 0 -> A, 25 -> Z, 26 -> AA ... */
export function columnLetters(columnIndex: number): string {
  let n = columnIndex + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Human label for a zero-based (row, column): (18, 7) -> "H19". */
export function cellLabel(row: number, column: number): string {
  return `${columnLetters(column)}${row + 1}`;
}

/**
 * Cell ids are deterministic (row-major, 1-based) because the seed assigns them
 * explicitly. This lets /grid ship only *claimed* cells: the other ids are implied.
 */
export function cellIdFromPosition(row: number, column: number, columns = BOARD_COLUMNS): number {
  return row * columns + column + 1;
}

export function positionFromCellId(id: number, columns = BOARD_COLUMNS): { row: number; column: number } {
  const zero = id - 1;
  return { row: Math.floor(zero / columns), column: zero % columns };
}
