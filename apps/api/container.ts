import type { Env } from "./config/env";
import type { Logger } from "./config/logger";
import type { Db } from "./lib/prisma";
import type { PresenceService } from "./redis/presence";
import type { RateLimiters, RedisPort } from "./redis/types";
import type { BoardService } from "./services/board.service";
import type { BroadcastService } from "./services/broadcast.service";
import type { ClaimService } from "./services/claim.service";
import type { SessionService } from "./services/session.service";
import type { UserService } from "./services/user.service";

/** Everything the HTTP layer needs, wired once in server.ts (or by tests). */
export interface AppDeps {
  env: Env;
  logger: Logger;
  db: Db;
  redis: RedisPort;
  limiters: RateLimiters;
  sessions: SessionService;
  users: UserService;
  board: BoardService;
  claims: ClaimService;
  broadcaster: BroadcastService;
  presence: PresenceService;
  isShuttingDown: () => boolean;
}
