import type { Request, Response } from "express";
import {
  activityQuerySchema,
  cellIdParamSchema,
  type BoardStatsDTO,
} from "@gridboard/shared";
import type { AppDeps } from "../container";

export function boardController(d: AppDeps) {
  return {
    async grid(_req: Request, res: Response) {
      res.json({ data: await d.board.getGrid() });
    },
    async cell(req: Request, res: Response) {
      const { id } = cellIdParamSchema.parse(req.params);
      res.json({ data: await d.board.getCell(id) });
    },
    async leaderboard(_req: Request, res: Response) {
      res.json({ data: await d.board.getLeaderboard() });
    },
    async stats(_req: Request, res: Response) {
      const [counts, online] = await Promise.all([
        d.board.getCounts(),
        d.presence.countOnline(),
      ]);
      const body: BoardStatsDTO = { ...counts, online };
      res.json({ data: body });
    },
    async activity(req: Request, res: Response) {
      const { limit } = activityQuerySchema.parse(req.query);
      res.json({ data: await d.board.getActivity(limit) });
    },
  };
}
