import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env on its own. `dotenv/config` alone would only look in the current
// directory (apps/api when run via pnpm), so point it at the repo-root .env explicitly.
// The first file found wins, and real environment variables are never overridden.
loadDotenv({
  path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")],
  quiet: true,
});

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env (repo root) and fill it in.");
}

try {
  const u = new URL(url);
  process.stderr.write(`[prisma] using database ${u.hostname}:${u.port || "5432"}${u.pathname}\n`);
} catch {
  /* an unparseable URL will be reported by Prisma itself */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
