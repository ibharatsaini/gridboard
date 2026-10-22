import { pino, type Logger } from "pino";
import type { Env } from "./env";

export type { Logger };

export function createLogger(env: Pick<Env, "NODE_ENV" | "LOG_LEVEL">): Logger {
  return pino({
    level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
    base: { service: "gridboard-api" },
    // Defence in depth: even if a header object is logged by accident, the bearer token is masked.
    redact: {
      paths: [
        "req.headers.authorization",
        "*.token",
        "*.sessionToken",
        "*.password",
        "*.UPSTASH_REDIS_REST_TOKEN",
      ],
      censor: "[redacted]",
    },
    ...(env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname,service" } } }
      : {}),
  });
}
