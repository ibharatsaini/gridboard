import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";

export { Prisma };

/**
 * Prisma 7 talks to Postgres through the driver adapter (node-postgres pool). `connectionTimeoutMillis`
 * lets a slow first connection (remote DB, TLS) succeed instead of failing fast.
 */
export function createPrisma(databaseUrl: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 10_000 }) });
}

export type Db = ReturnType<typeof createPrisma>;
