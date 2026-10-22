import type { Request, Response } from "express";
import { cellIdParamSchema, type ClaimResultDTO } from "@gridboard/shared";
import type { AppDeps } from "../container";
import { AppError } from "../errors/app-error";
import type { ClaimResult } from "../services/claim.service";

const seconds = (ms?: number) => Math.max(1, Math.ceil((ms ?? 0) / 1000));

function failureToError(
  userId: string,
  r: Extract<ClaimResult, { success: false }>,
): AppError {
  const details = {
    ...(r.retryAfterMs !== undefined ? { retryAfterMs: r.retryAfterMs } : {}),
    ...(r.owner ? { owner: r.owner } : {}),
    ...(r.lockedUntil ? { lockedUntil: r.lockedUntil } : {}),
  };
  switch (r.code) {
    case "CLAIM_COOLDOWN":
      return new AppError(
        r.code,
        `Wait ${(Math.max(r.retryAfterMs ?? 0, 0) / 1000).toFixed(1)}s before claiming again.`,
        details,
      );
    case "CELL_LOCKED":
      return new AppError(
        r.code,
        `${r.owner?.displayName ?? "Someone"} holds this cell. It unlocks in ${seconds(r.retryAfterMs)}s.`,
        details,
      );
    case "CELL_NOT_FOUND":
      return new AppError(r.code, "That cell does not exist.");
    case "CELL_ALREADY_CLAIMED":
      return new AppError(
        r.code,
        r.owner?.id === userId
          ? "You already own this cell."
          : "This cell has already been claimed.",
        details,
      );
  }
}

export function claimController(d: AppDeps) {
  return {
    async claim(req: Request, res: Response) {
      // The claimer is ALWAYS the authenticated session's user. The body is ignored entirely.
      const { id: cellId } = cellIdParamSchema.parse(req.params);
      const userId = req.auth!.user.id;
      const result = await d.claims.claim(userId, cellId);

      if (!result.success) {
        if (result.retryAfterMs)
          res.setHeader("Retry-After", seconds(result.retryAfterMs));
        throw failureToError(userId, result);
      }

      // Committed. Now (and only now) tell everyone. Not awaited: the client's response
      // does not wait on fan-out, and the broadcaster never throws.
      d.broadcaster.cellClaimed(result).catch((err: unknown) =>
        req.log.error(
          {
            event: "broadcast_error",
            type: "CELLS_CLAIMED",
            err,
            requestId: req.id,
          },
          "broadcast failed after commit",
        ),
      );

      const body: ClaimResultDTO = {
        cell: result.cell,
        owner: result.owner,
        stats: await d.board.getUserStats(userId, result.lastClaimAt),
      };
      res.json({ data: body });
    },
  };
}
