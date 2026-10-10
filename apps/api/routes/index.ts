import { Router } from "express";
import type { AppDeps } from "../container";
import { boardController } from "../controllers/board.controller";
import { claimController } from "../controllers/claim.controller";
import { userController } from "../controllers/user.controller";
import { clientIp, originGuard, rateLimit } from "../middleware/security";
import { requireAuth } from "../middleware/authentication";

export function createApiRouter(d: AppDeps): Router {
  const router = Router();
  const webOrigin = new URL(d.env.WEB_URL).origin;
  const origin = originGuard(webOrigin);
  const auth = requireAuth(d.sessions);

  const users = userController(d);
  const board = boardController(d);
  const claims = claimController(d);

  // Users / session
  router.post("/users/join", origin, rateLimit(d.limiters.join, "join", clientIp), users.join);
  router.get("/users/me", auth, users.me);
  router.post("/users/logout", origin, auth, users.logout);

  // Board (read-only; authenticated so anonymous scrapers can't hammer the DB)
  router.get("/grid", auth, board.grid);
  router.get("/cells/:id", auth, board.cell);
  router.get("/leaderboard", auth, board.leaderboard);
  router.get("/stats", auth, board.stats);
  router.get("/activity", auth, board.activity);

  // Command. Order matters: cheapest rejections first.
  router.post(
    "/cells/:id/claim",
    origin,
    rateLimit(d.limiters.claimPerIp, "claim_ip", clientIp), // before any DB work
    auth,
    rateLimit(d.limiters.claimPerUser, "claim_user", (req) => req.auth!.user.id),
    claims.claim,
  );

  return router;
}
