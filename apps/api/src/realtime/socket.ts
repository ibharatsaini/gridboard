import type { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis as IORedis } from "ioredis";
import { Server } from "socket.io";
import {
  BOARD_ROOM,
  userRoom,
  type ClientToServerEvents,
  type RealtimeEvent,
  type ServerToClientEvents,
} from "@gridboard/shared";
import type { Logger } from "../config/logger";
import { PRESENCE_REFRESH_MS, type PresenceService } from "../redis/presence";
import type { BroadcastService, EventEmitter } from "../services/broadcast.service";
import type { SessionService } from "../services/session.service";

interface SocketData {
  userId: string;
  displayName: string;
}

export interface RealtimeOptions {
  httpServer: HttpServer;
  webOrigin: string;
  sessions: SessionService;
  presence: PresenceService;
  logger: Logger;
  /** Dedicated TCP connections to Upstash. Omitted in tests (single-instance in-memory adapter). */
  redisPubSub?: { pub: IORedis; sub: IORedis };
}

export interface Realtime {
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  emitter: EventEmitter;
  /** Late-bound because BroadcastService needs the emitter, and the socket server needs the broadcaster. */
  bindBroadcaster(b: BroadcastService): void;
  close(): Promise<void>;
}

export function createRealtime(opts: RealtimeOptions): Realtime {
  const { logger } = opts;
  let broadcaster: BroadcastService | undefined;

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(opts.httpServer, {
    serveClient: false,
    cors: { origin: opts.webOrigin },
    // Tiny frames only: the server never needs large client messages.
    maxHttpBufferSize: 1_000,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    // Cross-site WebSocket hijacking guard. Browsers always send Origin; a mismatch is rejected
    // before the upgrade. Non-browser clients (no Origin) still need a valid token.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, !origin || origin === opts.webOrigin);
    },
  });

  if (opts.redisPubSub) {
    const adapter = createAdapter(opts.redisPubSub.pub, opts.redisPubSub.sub);
    io.adapter(adapter);
    // Classic (non-sharded) Pub/Sub: Upstash does not support sharded channels.
    io.of("/").adapter.on?.("error", (err: unknown) => logger.error({ event: "redis_error", op: "socket.adapter", err }, "socket.io redis adapter error"));
  }

  // Authentication: the handshake must carry a valid session token in `auth.token` (Socket.IO's handshake
  // payload; never in the URL, so it cannot end up in access logs). Identity is taken from the session,
  // never from anything else the client sends.
  io.use(async (socket, next) => {
    try {
      const presented: unknown = socket.handshake.auth?.token;
      const token = typeof presented === "string" ? presented : undefined;
      const auth = await opts.sessions.resolve(token);
      if (!auth) return next(new Error("UNAUTHORIZED"));
      socket.data.userId = auth.user.id;
      socket.data.displayName = auth.user.displayName;
      next();
    } catch (err) {
      logger.error({ event: "socket_auth_error", err }, "socket auth failed");
      next(new Error("INTERNAL_ERROR"));
    }
  });

  io.on("connection", (socket) => {
    const { userId } = socket.data;
    void socket.join([BOARD_ROOM, userRoom(userId)]);
    void opts.presence.register(socket.id, userId).then(() => broadcaster?.schedulePresence());

    // Deliberately NO socket.on(...) handlers: the client cannot emit anything the server acts on.

    socket.on("disconnect", () => {
      void opts.presence.unregister(socket.id).then(() => broadcaster?.schedulePresence());
    });
  });

  // Re-score this instance's sockets and refresh the count so crashed peers age out.
  const heartbeat = setInterval(() => {
    void opts.presence.refresh().then(() => broadcaster?.publishPresence());
  }, PRESENCE_REFRESH_MS);
  heartbeat.unref();

  const emitter: EventEmitter = {
    toBoard: (event: RealtimeEvent) => void io.to(BOARD_ROOM).emit(event.type, event as never),
    toUser: (userId: string, event: RealtimeEvent) => void io.to(userRoom(userId)).emit(event.type, event as never),
  };

  return {
    io,
    emitter,
    bindBroadcaster: (b) => {
      broadcaster = b;
    },
    close: async () => {
      clearInterval(heartbeat);
      await io.close();
    },
  };
}

export const newInstanceId = () => randomUUID().slice(0, 8);
