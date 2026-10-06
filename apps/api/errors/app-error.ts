import type { ErrorCode } from "@gridboard/shared";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  CELL_NOT_FOUND: 404,
  NOT_FOUND: 404,
  CELL_ALREADY_CLAIMED: 409,
  CELL_LOCKED: 409,
  CLAIM_COOLDOWN: 429,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/** Expected, user-presentable failures. Anything else is an unexpected 500. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}
