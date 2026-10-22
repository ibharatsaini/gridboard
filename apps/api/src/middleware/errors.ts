import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import type { ApiErrorBody } from "@gridboard/shared";
import { AppError } from "../errors/app-error";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError("NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

/** The only place responses for failures are built, so nothing internal can leak. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id);

  let status = 500;
  let body: ApiErrorBody["error"] = { code: "INTERNAL_ERROR", message: "Something went wrong on our side.", requestId };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, requestId, ...(err.details ? { details: err.details } : {}) };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      code: "VALIDATION_ERROR",
      message: "The request was invalid.",
      requestId,
      details: { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
    };
  } else if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") {
    status = err.type === "entity.too.large" ? 413 : 400;
    body = { code: "VALIDATION_ERROR", message: "Malformed or oversized request body.", requestId };
  }

  if (status >= 500) {
    // Full detail goes to logs only (never the client): SQL, Prisma, stack traces.
    req.log.error({ event: "unhandled_error", err, requestId }, "request failed");
  }
  res.status(status).json({ error: body } satisfies ApiErrorBody);
};
