import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { AppDeps } from "./container";
import { errorHandler, notFoundHandler } from "./middleware/errors";
import { createApiRouter } from "./routes";

const REQUEST_ID = /^[\w.-]{8,64}$/;

export function createApp(d: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", d.env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger: d.logger,
      // Honour a well-formed upstream id for cross-service tracing; never trust arbitrary strings.
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      // No per-request access log: it only attaches `req.log` and the request id. Errors are logged by the error handler.
      autoLogging: false,
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: new URL(d.env.WEB_URL).origin, // exact origin: only our own web app may call the API from a browser
      allowedHeaders: ["content-type", "authorization", "x-request-id"],
      exposedHeaders: ["retry-after", "x-request-id"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "8kb" }));
  
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // Liveness: the process is up. Readiness: it can actually serve (and is not draining).
  app.get("/health", (_req, res) => res.json({ status: "ok" }));


  app.use("/api/v1", createApiRouter(d));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
