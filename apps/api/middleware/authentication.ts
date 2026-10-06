import type { RequestHandler } from "express";
import { SessionService } from "../services/session.service";
import { AppError } from "../errors/app-error";


export const bearerToken = (header: string | undefined): string | undefined => header?.match(BEARER)?.[1];
const BEARER = /^Bearer ([A-Za-z0-9_-]{20,128})$/i;

export function requireAuth(sessions: SessionService): RequestHandler {
  return async (req, _res, next) => {
    const auth = await sessions.resolve(bearerToken(req.get("authorization")));
    if (!auth) throw new AppError("UNAUTHORIZED", "Join the board to continue.");
    req.auth = auth;
    next();
  };
}