import type { Db } from "./prisma";

/** Host/port/database only. Never includes the user or password. */
export function describeDatabase(url: string): string {
  try {
    const u = new URL(url);
    const schema = u.searchParams.get("schema");
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "")}${schema ? ` (schema ${schema})` : ""}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

export interface SchemaProblem {
  table: string;
  detail: string;
}

/**
 * Selecting EVERY mapped column of every model with Prisma queries proves the live tables match
 * schema.prisma (a missing table or column makes that query fail). Cheap: one row per table.
 */
export async function checkSchema(db: Db): Promise<SchemaProblem[]> {
  const probes: Array<[string, () => Promise<unknown>]> = [
    ["users", () => db.user.findFirst({ select: { id: true, displayName: true, color: true, createdAt: true, lastClaimAt: true } })],
    ["sessions", () => db.session.findFirst({ select: { id: true, tokenHash: true, userId: true, createdAt: true, expiresAt: true } })],
    ["cells", () => db.cell.findFirst({ select: { id: true, row: true, column: true, ownerId: true, claimedAt: true, lockedUntil: true, version: true } })],
    ["claims", () => db.claim.findFirst({ select: { id: true, cellId: true, userId: true, previousOwnerId: true, cellVersion: true, createdAt: true } })],
    ["activity_events", () => db.activityEvent.findFirst({ select: { id: true, type: true, userId: true, cellId: true, createdAt: true } })],
  ];
  const problems: SchemaProblem[] = [];
  for (const [table, probe] of probes) {
    try {
      await probe();
    } catch (err) {
      const e = err as { message?: string; meta?: { driverAdapterError?: { cause?: { originalMessage?: string } } } };
      const original = e.meta?.driverAdapterError?.cause?.originalMessage;
      problems.push({ table, detail: (original ?? e.message ?? String(err)).split("\n").filter(Boolean).slice(-1)[0]! });
    }
  }
  return problems;
}

const CONNECTION_ERROR = /can't reach database|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timed out|connection terminated|P1001|P1002/i;

/** True when every probe failed because the server could not be reached (not because of the schema). */
export function isConnectionFailure(problems: SchemaProblem[]): boolean {
  return problems.length > 0 && problems.every((p) => CONNECTION_ERROR.test(p.detail));
}

export function formatConnectionFailure(target: string, problems: SchemaProblem[]): string {
  return [
    `Cannot reach the database at ${target}: ${problems[0]!.detail}`,
    "Is PostgreSQL running? (`docker compose up -d`, then `docker compose ps`) and does DATABASE_URL point at it?",
  ].join("\n");
}

export function formatSchemaProblems(target: string, problems: SchemaProblem[]): string {
  if (isConnectionFailure(problems)) return formatConnectionFailure(target, problems);
  return [
    `Database schema does not match prisma/schema.prisma (connected to ${target}).`,
    ...problems.map((p) => `  - ${p.table}: ${p.detail}`),
    "",
    "This database was not created by this project's migrations (or they only partly applied).",
    "Fix:   pnpm db:reset        (drops ALL data in that database, re-applies migrations, re-seeds)",
    "Check: you migrated the SAME database the API reads. DATABASE_URL in the repo-root .env, and any",
    "       DATABASE_URL already exported in your shell (a shell value overrides .env), must agree.",
  ].join("\n");
}
