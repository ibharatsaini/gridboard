/** REST contracts. Every success body is `{ data }`, every failure is `{ error }`. */

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "CELL_NOT_FOUND"
  | "CELL_ALREADY_CLAIMED"
  | "CELL_LOCKED"
  | "CLAIM_COOLDOWN"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Extra, safe, machine-readable context (e.g. retryAfterMs, owner). */
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export interface ApiSuccess<T> {
  data: T;
}

export interface UserDTO {
  id: string;
  displayName: string;
  color: string;
  createdAt: string;
}

/** The public face of a cell owner. */
export interface OwnerDTO {
  id: string;
  displayName: string;
  color: string;
}

export interface CellDTO {
  id: number;
  row: number;
  column: number;
  ownerId: string | null;
  claimedAt: string | null;
  lockedUntil: string | null;
  version: number;
}

export interface GridDTO {
  rows: number;
  columns: number;
  /** Server clock at response time; clients derive their clock skew from it. */
  serverTime: string;
  /** Only claimed cells. Unclaimed ids are implied by the board dimensions. */
  cells: CellDTO[];
  owners: Record<string, OwnerDTO>;
}

export interface LeaderboardEntryDTO {
  rank: number;
  user: OwnerDTO;
  cells: number;
  territories: number;
  score: number;
}

export interface LeaderboardDTO {
  generatedAt: string;
  entries: LeaderboardEntryDTO[];
}

/** Counts derived from the cells table. */
export interface BoardCountsDTO {
  totalCells: number;
  claimed: number;
  available: number;
}

/** Counts plus approximate presence (which lives in Redis, not Postgres). */
export interface BoardStatsDTO extends BoardCountsDTO {
  online: number;
}

export interface UserStatsDTO {
  cells: number;
  territories: number;
  score: number;
  /** ISO time until which this user is on cooldown, or null. */
  cooldownUntil: string | null;
}

export interface SessionDTO {
  user: UserDTO;
  stats: UserStatsDTO;
}

/**
 * Response of POST /users/join: the session plus the bearer token. The token is returned exactly once, here;
 * the server stores only its hash. The client keeps it and sends `Authorization: Bearer <token>`.
 */
export interface JoinResultDTO extends SessionDTO {
  token: string;
  /** ISO time the session expires. */
  expiresAt: string;
}

export type ActivityKind = "CLAIM" | "JOIN";

export interface ActivityDTO {
  id: string;
  kind: ActivityKind;
  at: string;
  user: OwnerDTO;
  /** Cell label like "H19" for CLAIM events. */
  cellLabel: string | null;
  cellId: number | null;
}

export interface CellDetailDTO {
  cell: CellDTO;
  owner: OwnerDTO | null;
  history: Array<{ at: string; user: OwnerDTO }>;
}

export interface ClaimResultDTO {
  cell: CellDTO;
  owner: OwnerDTO;
  stats: UserStatsDTO;
}
