import type { JoinRequest, OwnerDTO, UserDTO } from "@gridboard/shared";
import type { Db } from "../lib/prisma";
import type { SessionService } from "./session.service";
import { toOwnerDTO } from "./board.service";

export const toUserDTO = (u: { id: string; displayName: string; color: string; createdAt: Date }): UserDTO => ({
  id: u.id,
  displayName: u.displayName,
  color: u.color,
  createdAt: u.createdAt.toISOString(),
});

export class UserService {
  constructor(
    private readonly db: Db,
    private readonly sessions: SessionService,
  ) {}

 
  async join(input: JoinRequest) {
    const { token, tokenHash, expiresAt } = this.sessions.issueToken();
    const user = await this.db.user.create({
      data: {
        displayName: input.displayName,
        color: input.color,
        sessions: { create: { tokenHash, expiresAt } },
        activity: { create: { type: "JOIN" } },
      },
      include: { sessions: { select: { id: true } } },
    });
    const owner: OwnerDTO = toOwnerDTO(user);
    return { user: toUserDTO(user), owner, token, sessionId: user.sessions[0]!.id, expiresAt };
  }
}
