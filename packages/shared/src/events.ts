import type { BoardCountsDTO, LeaderboardDTO, OwnerDTO, UserStatsDTO } from "./api";

/** Envelope fields every realtime event carries. */
interface EventBase<T extends string, P> {
  /** Unique per event; clients dedupe on it. */
  eventId: string;
  type: T;
  /** ISO server time the event was created. */
  timestamp: string;
  payload: P;
}

/**
 * The minimum a client needs to apply one claim. `row`/`column` are derived from `id`
 * (positionFromCellId) and the label from those, so none of that travels on the wire.
 */
export interface CellDiff {
  id: number;
  ownerId: string;
  claimedAt: string;
  lockedUntil: string | null;
  version: number;
}

export interface ClaimDiff {
  cell: CellDiff;
  previousOwnerId: string | null;
}

/**
 * Claims that landed within one batching window (default 50 ms), in commit order, as ONE message.
 * `owners` carries each distinct claimer once so a client that has never seen them can still render them;
 * a client that already knows an owner simply ignores the entry.
 */
export type CellsClaimedEvent = EventBase<
  "CELLS_CLAIMED",
  { claims: ClaimDiff[]; owners: Record<string, OwnerDTO> }
>;
export type UserJoinedEvent = EventBase<"USER_JOINED", { user: OwnerDTO }>;
export type StatsUpdatedEvent = EventBase<"STATS_UPDATED", BoardCountsDTO>;
export type LeaderboardUpdatedEvent = EventBase<"LEADERBOARD_UPDATED", LeaderboardDTO>;
export type PresenceUpdatedEvent = EventBase<"PRESENCE_UPDATED", { online: number }>;
/** Sent only to the affected user's private room. */
export type UserStatsUpdatedEvent = EventBase<"USER_STATS_UPDATED", UserStatsDTO>;

export type RealtimeEvent =
  | CellsClaimedEvent
  | UserJoinedEvent
  | StatsUpdatedEvent
  | LeaderboardUpdatedEvent
  | PresenceUpdatedEvent
  | UserStatsUpdatedEvent;

export type RealtimeEventType = RealtimeEvent["type"];

/**
 * Socket.IO event names are the event `type` itself; the argument is the full envelope.
 * The client never emits anything: commands go through REST, so there is no
 * client->server surface to abuse.
 */
export interface ServerToClientEvents {
  CELLS_CLAIMED: (event: CellsClaimedEvent) => void;
  USER_JOINED: (event: UserJoinedEvent) => void;
  STATS_UPDATED: (event: StatsUpdatedEvent) => void;
  LEADERBOARD_UPDATED: (event: LeaderboardUpdatedEvent) => void;
  PRESENCE_UPDATED: (event: PresenceUpdatedEvent) => void;
  USER_STATS_UPDATED: (event: UserStatsUpdatedEvent) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {}

export const BOARD_ROOM = "board";
export const userRoom = (userId: string) => `user:${userId}`;
