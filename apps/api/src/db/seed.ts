import { pathToFileURL } from "node:url";
import { BOARD_COLUMNS, BOARD_ROWS, cellIdFromPosition } from "@gridboard/shared";
import { loadEnv } from "../config/env";
import { createPrisma, type Db } from "../lib/prisma";

/**
 * Idempotent: explicit deterministic ids + skipDuplicates, so running it twice (or
 * against a partly seeded board) never creates duplicates. Existing ownership is untouched.
 */
export async function ensureCells(db: Db, rows = BOARD_ROWS, columns = BOARD_COLUMNS): Promise<{ created: number; total: number }> {
  const data = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      data.push({ id: cellIdFromPosition(row, column, columns), row, column });
    }
  }
  const { count } = await db.cell.createMany({ data, skipDuplicates: true });
  // Ids are explicit (row-major) and nothing else inserts cells, so the autoincrement sequence is never used.
  return { created: count, total: await db.cell.count() };
}

// `pnpm db:seed` runs this file directly; importing it (tests) only exposes ensureCells.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = loadEnv({ ...process.env, REDIS_DRIVER: "memory", NODE_ENV: "test" } as NodeJS.ProcessEnv);
  const db = createPrisma(env.DATABASE_URL);
  ensureCells(db)
    .then(({ created, total }) => console.log(`Seed complete: ${created} new cells created, ${total} cells total.`))
    .catch((e) => {
      console.error("Seed failed:", e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
