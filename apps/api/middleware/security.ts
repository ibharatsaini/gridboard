import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../errors/app-error";
import type { RateLimiter } from "../redis/types";

export const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? "unknown";


/**
 * Defence in depth for state-changing routes: if a browser sent an Origin it must be exactly our web origin.
 * (Not a CSRF control any more, since there are no ambient credentials; it just keeps other sites' pages from
 * driving the API, e.g. minting accounts.)
 */
export function originGuard(webOrigin: string): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get("origin");
    if (origin && origin !== webOrigin) throw new AppError("FORBIDDEN", "Cross-origin request rejected.");
    next();
  };
}

export function rateLimit(
  limiter: RateLimiter,
  name: string,
  keyOf: (req: Request) => string,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await limiter.limit(keyOf(req));
    if (!result.success) {
      const retryAfterMs = Math.max(result.retryAfterMs, 1000);
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000));
      throw new AppError("RATE_LIMITED", "Too many requests. Slow down a little.", { retryAfterMs });
    }
    next();
  };
}
