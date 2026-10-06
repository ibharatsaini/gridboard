import { z } from "zod";

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().min(1),
  WEB_URL: z.url(),
  API_URL: z.url(),

  /** Hops of reverse proxy in front of the API (for correct client IPs). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  /** TCP/TLS endpoint (rediss://...) used for Socket.IO Pub/Sub. REST cannot subscribe. */
  UPSTASH_REDIS_URL: z.string().regex(/^rediss?:\/\//, "must start with redis:// or rediss://").optional(),
});

export const envSchema = baseSchema.superRefine((env, ctx) => {
  
  for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "UPSTASH_REDIS_URL"] as const) {
    if (!env[key]) {
      ctx.addIssue({ code: "custom", path: [key], message: `${key} is required (Upstash Redis is mandatory)` });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/** Parses and fails fast, listing every problem at once. Never prints secret values. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}
