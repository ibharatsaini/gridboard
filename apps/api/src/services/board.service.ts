import {
  ACTIVITY_LIMIT,
  BOARD_COLUMNS,
  BOARD_ROWS,
  CLAIM_COOLDOWN_MS,
  LEADERBOARD_SIZE,
  TOTAL_CELLS,
  cellLabel,
  positionFromCellId,
  type ActivityDTO,
  type BoardCountsDTO,
  type CellDetailDTO,
  type GridDTO,
  type LeaderboardDTO,
  type OwnerDTO,
  type UserStatsDTO,
} from "@gridboard/shared";
import type { Db } from "../lib/prisma";
import { cooldownUntil } from "../lib/cooldown";
import { computeTerritories, summaryFor } from "../lib/territory";
import { AppError } from "../errors/app-error";

export { toCellDTO, toOwnerDTO } from "../lib/dto";
import { toCellDTO, toOwnerDTO } from "../lib/dto";

/** Read side of the board: grid, stats, standings, history. Every view reads PostgreSQL directly. */
export class BoardService {
  constructor(private readonly db: Db) {}

  /** All owned cells (with their owners) in one query. */
  private async loadOwned() {
    return this.db.cell.findMany({
      where: { ownerId: { not: null } },
      include: {
        owner: { select: { id: true, displayName: true, color: true } },
      },
      orderBy: { id: "asc" },
    });
  }

  async getGrid(): Promise<GridDTO> {
    const rows = await this.loadOwned();
    const owners: Record<string, OwnerDTO> = {};
    for (const c of rows) if (c.owner) owners[c.owner.id] = toOwnerDTO(c.owner);
    return {
      rows: BOARD_ROWS,
      columns: BOARD_COLUMNS,
      serverTime: new Date().toISOString(),
      cells: rows.map(toCellDTO),
      owners,
    };
  }

  async getCell(id: number): Promise<CellDetailDTO> {
    const cell = await this.db.cell.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, displayName: true, color: true } },
        claims: {
          orderBy: { id: "desc" },
          take: 10,
          include: {
            user: { select: { id: true, displayName: true, color: true } },
          },
        },
      },
    });
    if (!cell)
      throw new AppError("CELL_NOT_FOUND", "That cell does not exist.");
    return {
      cell: toCellDTO(cell),
      owner: cell.owner ? toOwnerDTO(cell.owner) : null,
      history: cell.claims.map((c) => ({
        at: c.createdAt.toISOString(),
        user: toOwnerDTO(c.user),
      })),
    };
  }

  async getCounts(): Promise<BoardCountsDTO> {
    const claimed = await this.db.cell.count({
      where: { ownerId: { not: null } },
    });
    return {
      totalCells: TOTAL_CELLS,
      claimed,
      available: TOTAL_CELLS - claimed,
    };
  }

  /** Counts + standings from ONE read, however many claims triggered the broadcast. */
  async getSummaries(): Promise<{
    counts: BoardCountsDTO;
    leaderboard: LeaderboardDTO;
  }> {
    const rows = await this.loadOwned();
    const owners = new Map<string, OwnerDTO>();
    for (const c of rows)
      if (c.owner) owners.set(c.owner.id, toOwnerDTO(c.owner));

    const territories = computeTerritories(
      rows.map((c) => ({ row: c.row, column: c.column, ownerId: c.ownerId! })),
      BOARD_ROWS,
      BOARD_COLUMNS,
    );
    const entries = [...territories.entries()]
      .sort(([, a], [, b]) => b.score - a.score || b.cells - a.cells)
      .slice(0, LEADERBOARD_SIZE)
      .flatMap(([id, t], i) => {
        const user = owners.get(id);
        return user
          ? [
              {
                rank: i + 1,
                user,
                cells: t.cells,
                territories: t.territories,
                score: t.score,
              },
            ]
          : [];
      });

    return {
      counts: {
        totalCells: TOTAL_CELLS,
        claimed: rows.length,
        available: TOTAL_CELLS - rows.length,
      },
      leaderboard: { generatedAt: new Date().toISOString(), entries },
    };
  }

  async getLeaderboard(): Promise<LeaderboardDTO> {
    return (await this.getSummaries()).leaderboard;
  }

  /** Only this user's cells are needed: a territory never spans owners. */
  async getUserStats(
    userId: string,
    lastClaimAt?: Date | null,
  ): Promise<UserStatsDTO> {
    const [mine, user] = await Promise.all([
      this.db.cell.findMany({
        where: { ownerId: userId },
        select: { row: true, column: true },
      }),
      lastClaimAt === undefined
        ? this.db.user.findUnique({
            where: { id: userId },
            select: { lastClaimAt: true },
          })
        : Promise.resolve({ lastClaimAt }),
    ]);
    const t = summaryFor(
      computeTerritories(
        mine.map((c) => ({ ...c, ownerId: userId })),
        BOARD_ROWS,
        BOARD_COLUMNS,
      ),
      userId,
    );
    const until = cooldownUntil(
      user?.lastClaimAt ?? null,
      new Date(),
      CLAIM_COOLDOWN_MS,
    );
    return {
      cells: t.cells,
      territories: t.territories,
      score: t.score,
      cooldownUntil: until?.toISOString() ?? null,
    };
  }

  async getActivity(limit = ACTIVITY_LIMIT): Promise<ActivityDTO[]> {
    const events = await this.db.activityEvent.findMany({
      orderBy: { id: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, displayName: true, color: true } },
      },
    });
    return events.map((e) => {
      const label = e.cellId
        ? (({ row, column }) => cellLabel(row, column))(
            positionFromCellId(e.cellId),
          )
        : null;
      return {
        id: String(e.id),
        kind: e.type,
        at: e.createdAt.toISOString(),
        user: toOwnerDTO(e.user),
        cellLabel: label,
        cellId: e.cellId,
      };
    });
  }
}
