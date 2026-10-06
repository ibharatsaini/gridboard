import { createHash, randomBytes } from "node:crypto";
import { SESSION_TTL_MS } from "@gridboard/shared";
import type { Db } from "../lib/prisma";

export interface AuthContext {
  sessionId: string;
  user: { id: string; displayName: string; color: string; createdAt: Date; lastClaimAt: Date | null };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export class SessionService {
  constructor(private readonly db: Db) {}


  issueToken() {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) };
  }

  async create(userId: string) {
    const { token, tokenHash, expiresAt } = this.issueToken();
    const session = await this.db.session.create({ data: { tokenHash, userId, expiresAt } });
    return { token, sessionId: session.id, expiresAt };
  }

  async resolve(token: string | undefined): Promise<AuthContext | null> {
    if (!token || token.length < 20 || token.length > 128) return null;
    const session = await this.db.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    return { sessionId: session.id, user: session.user };
  }

  async destroy(sessionId: string) {
    await this.db.session.deleteMany({ where: { id: sessionId } });
  }

  async purgeExpired(): Promise<number> {
    const { count } = await this.db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return count;
  }
}
