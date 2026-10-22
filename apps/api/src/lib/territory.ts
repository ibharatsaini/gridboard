import { TERRITORY_RULE } from "@gridboard/shared";

export interface OwnedCell {
  row: number;
  column: number;
  ownerId: string;
}

export interface TerritorySummary {
  /** Cells owned. */
  cells: number;
  /** Number of orthogonally-connected groups. */
  territories: number;
  /** cells + sum(groupSize - 1): rewards contiguous land over scattered cells. */
  score: number;
}

const EMPTY: TerritorySummary = { cells: 0, territories: 0, score: 0 };

/**
 * Scores every owner in a single O(N) pass using an iterative BFS flood fill
 * (no recursion, so no stack risk on larger boards). Neighbours are the four
 * orthogonal cells. Diagonals deliberately do not connect.
 */
export function computeTerritories(
  owned: readonly OwnedCell[],
  rows: number,
  columns: number,
): Map<string, TerritorySummary> {
  const ownerIndex = new Map<string, number>();
  const ownerIds: string[] = [];
  const grid = new Int32Array(rows * columns).fill(-1);

  for (const cell of owned) {
    if (cell.row < 0 || cell.row >= rows || cell.column < 0 || cell.column >= columns) continue;
    let idx = ownerIndex.get(cell.ownerId);
    if (idx === undefined) {
      idx = ownerIds.length;
      ownerIndex.set(cell.ownerId, idx);
      ownerIds.push(cell.ownerId);
    }
    grid[cell.row * columns + cell.column] = idx;
  }

  const visited = new Uint8Array(rows * columns);
  const queue = new Int32Array(rows * columns);
  const totals = ownerIds.map(() => ({ cells: 0, territories: 0, score: 0 }));

  for (let start = 0; start < grid.length; start++) {
    const owner = grid[start]!;
    if (owner === -1 || visited[start]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let size = 0;

    while (head < tail) {
      const current = queue[head++]!;
      size++;
      const r = Math.floor(current / columns);
      const c = current % columns;
      const neighbours = [
        r > 0 ? current - columns : -1,
        r < rows - 1 ? current + columns : -1,
        c > 0 ? current - 1 : -1,
        c < columns - 1 ? current + 1 : -1,
      ];
      for (const n of neighbours) {
        if (n !== -1 && !visited[n] && grid[n] === owner) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }

    const t = totals[owner]!;
    t.cells += size;
    t.territories += 1;
    t.score += size * TERRITORY_RULE.perCell + TERRITORY_RULE.perGroupBonus(size);
  }

  return new Map(ownerIds.map((id, i) => [id, totals[i]!]));
}

export function summaryFor(map: Map<string, TerritorySummary>, userId: string): TerritorySummary {
  return map.get(userId) ?? EMPTY;
}
