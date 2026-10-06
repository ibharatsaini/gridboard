import type { Request, Response } from "express";
import { joinRequestSchema, type JoinResultDTO, type SessionDTO } from "@gridboard/shared";
import type { AppDeps } from "../container";
import { toUserDTO } from "../services/user.service";

export function userController(d: AppDeps) {
  return {
    async join(req: Request, res: Response) {
      const input = joinRequestSchema.parse(req.body);
      const joined = await d.users.join(input);

      d.broadcaster.userJoined(joined.owner);

      const body: JoinResultDTO = {
        user: joined.user,
        stats: await d.board.getUserStats(joined.user.id, null),
        token: joined.token,
        expiresAt: joined.expiresAt.toISOString(),
      };
      res.status(201).json({ data: body });
    },

    async me(req: Request, res: Response) {
      const { user } = req.auth!;
      const body: SessionDTO = {
        user: toUserDTO(user),
        stats: await d.board.getUserStats(user.id, user.lastClaimAt),
      };
      res.json({ data: body });
    },

    async logout(req: Request, res: Response) {
      await d.sessions.destroy(req.auth!.sessionId);
      res.status(204).end();
    },
  };
}
