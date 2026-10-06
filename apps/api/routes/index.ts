import { Router } from "express";
import type { AppDeps } from "../container";
import { boardController } from "../controllers/board.controller";
import { userController } from "../controllers/user.controller";
import { requireAuth } from "../middleware/authentication";

export function createApiRouter(d: AppDeps): Router {
  const router = Router();
   const auth = requireAuth(d.sessions);

  const users = userController(d);
  const board = boardController(d);

  // Users / session
  router.post("/users/join", users.join);
  router.get("/users/me", auth, users.me);
  router.post("/users/logout", auth, users.logout);

  router.get("/grid", auth, board.grid);
  router.get("/cells/:id", auth, board.cell);
  router.get("/leaderboard", auth, board.leaderboard);
  router.get("/stats", auth, board.stats);
  router.get("/activity", auth, board.activity);


  return router;
}
