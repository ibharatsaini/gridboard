import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import {
  ACTIVITY_LIMIT, cellLabel, positionFromCellId, type ActivityDTO, type BoardStatsDTO, type CellsClaimedEvent, type ClientToServerEvents,
  type LeaderboardUpdatedEvent, type PresenceUpdatedEvent, type ServerToClientEvents, type SessionDTO,
  type StatsUpdatedEvent, type UserJoinedEvent, type UserStatsUpdatedEvent,
} from "@gridboard/shared";
import { API_URL } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth-token";
import { diffToCellState } from "@/lib/board-model";
import { createDeduper, createOrderGuard, prependBounded } from "@/lib/events";
import { keys, reconcile } from "@/lib/queries";
import { useBoardStore } from "@/store/board";
import { useViewStore } from "@/store/view";

/** One socket for the signed-in session. Cleans up every listener on unmount. */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const dedupe = createDeduper();
    const order = createOrderGuard();
    const setStatus = useViewStore.getState().setStatus;
    let wasLive = false;
    let lostToast = false;

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL, {
      // Read on every (re)connect so a token that changed (re-join in another tab) is picked up.
      auth: (cb) => cb({ token: getToken() }),
      // WebSocket-only: no HTTP long-polling, so no sticky sessions are needed behind a load balancer.
      transports: ["websocket"],
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });

    const onConnect = () => {
      setStatus("live");
      // Missed events are possible whenever we were away: rebuild from the source of truth.
      reconcile(qc).catch(() => toast.error("Couldn't refresh the board. Retrying on the next update."));
      if (wasLive && lostToast) toast.success("Back online", { id: "conn" });
      lostToast = false;
      wasLive = true;
    };
    const onLost = () => {
      setStatus(navigator.onLine ? "reconnecting" : "offline");
      if (!lostToast) {
        lostToast = true;
        toast.warning("Connection lost. Reconnecting…", { id: "conn", duration: Infinity });
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", (reason) => reason !== "io client disconnect" && onLost());
    socket.on("connect_error", (err) => {
      if (err.message === "UNAUTHORIZED") {
        clearToken(); // the server rejected it: expired or revoked
        void qc.invalidateQueries({ queryKey: keys.me });
      }
      else onLost();
    });
    socket.io.on("reconnect_attempt", (n) => setStatus(navigator.onLine && n < 6 ? "reconnecting" : "offline"));

    socket.on("CELLS_CLAIMED", (e: CellsClaimedEvent) => {
      if (!dedupe.firstTime(e.eventId)) return;
      const { claims, owners } = e.payload;
      // One store update for the whole batch: subscribers are notified once and only changed cells re-render.
      useBoardStore.getState().applyCells(claims.map((c) => diffToCellState(c.cell)), owners);
      const known = useBoardStore.getState().owners;
      const items: ActivityDTO[] = [];
      for (const c of claims) {
        const user = owners[c.cell.ownerId] ?? known[c.cell.ownerId];
        if (!user) continue;
        const { row, column } = positionFromCellId(c.cell.id);
        // Newest first, matching the feed's order.
        items.unshift({
          id: `${e.eventId}:${c.cell.id}`, kind: "CLAIM", at: e.timestamp, user,
          cellLabel: cellLabel(row, column), cellId: c.cell.id,
        });
      }
      if (items.length > 0) {
        qc.setQueryData<ActivityDTO[]>(keys.activity, (old) => [...items, ...(old ?? [])].slice(0, ACTIVITY_LIMIT));
      }
    });
    socket.on("USER_JOINED", (e: UserJoinedEvent) => {
      if (!dedupe.firstTime(e.eventId)) return;
      const item: ActivityDTO = { id: e.eventId, kind: "JOIN", at: e.timestamp, user: e.payload.user, cellLabel: null, cellId: null };
      qc.setQueryData<ActivityDTO[]>(keys.activity, (old) => prependBounded(old, item, ACTIVITY_LIMIT));
    });
    socket.on("STATS_UPDATED", (e: StatsUpdatedEvent) => {
      if (!dedupe.firstTime(e.eventId) || !order.accept("stats", e.timestamp)) return;
      qc.setQueryData<BoardStatsDTO>(keys.stats, (old) => ({ online: 0, ...old, ...e.payload }));
    });
    socket.on("PRESENCE_UPDATED", (e: PresenceUpdatedEvent) => {
      if (!dedupe.firstTime(e.eventId) || !order.accept("presence", e.timestamp)) return;
      qc.setQueryData<BoardStatsDTO>(keys.stats, (old) => (old ? { ...old, online: e.payload.online } : old));
    });
    socket.on("LEADERBOARD_UPDATED", (e: LeaderboardUpdatedEvent) => {
      if (!dedupe.firstTime(e.eventId) || !order.accept("leaderboard", e.timestamp)) return;
      qc.setQueryData(keys.leaderboard, e.payload);
    });
    socket.on("USER_STATS_UPDATED", (e: UserStatsUpdatedEvent) => {
      if (!dedupe.firstTime(e.eventId) || !order.accept("userStats", e.timestamp)) return;
      qc.setQueryData<SessionDTO>(keys.me, (old) => (old ? { ...old, stats: e.payload } : old));
    });

    const goOffline = () => setStatus("offline");
    const goOnline = () => {
      if (!socket.connected) return setStatus("reconnecting");
      // A brief network drop can leave the socket looking connected (the transport has not noticed yet), yet
      // events sent meanwhile were lost. Trust it again, but rebuild from the source of truth to be safe.
      setStatus("live");
      reconcile(qc).catch(() => toast.error("Couldn't refresh the board. Retrying on the next update."));
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      toast.dismiss("conn");
    };
  }, [enabled, qc]);
}
