import type { Env } from "./config/env";
import type { Logger } from "./config/logger";
import type { Db } from "./lib/prisma";
import { BoardService } from "./services/board.service";
import { SessionService } from "./services/session.service";

import type { UserService } from "./services/user.service";

// erything the HTTP layer needs
export interface AppDeps {
  env: Env;
  logger: Logger;
  db: Db;
  sessions: SessionService;
  users: UserService;
  board: BoardService;
  
  isShuttingDown: () => boolean;
}
