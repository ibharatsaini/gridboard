import type { AuthContext } from "../services/session.service";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. Identity always comes from here, never from the request body. */
      auth?: AuthContext;
    }
  }
}
