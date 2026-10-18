import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBoardStore } from "@/store/board";

export const keys = {
  me: ["me"] as const,
  stats: ["stats"] as const,
  leaderboard: ["leaderboard"] as const,
  activity: ["activity"] as const,
};

/** Real-time drives freshness; never refetch on focus/reconnect automatically. */
export const liveQueryOptions = { staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false } as const;

/**
 * Authoritative resync: used on first connect and after every reconnect, because
 * Socket.IO events are not durable. Cell data is merged by version, so a snapshot can
 * never overwrite a newer live event that raced it.
 */
export async function reconcile(qc: QueryClient): Promise<void> {
  const [grid, stats, leaderboard, activity, me] = await Promise.all([
    api.grid(), api.stats(), api.leaderboard(), api.activity(), api.me(),
  ]);
  useBoardStore.getState().hydrate(grid);
  qc.setQueryData(keys.stats, stats);
  qc.setQueryData(keys.leaderboard, leaderboard);
  qc.setQueryData(keys.activity, activity);
  qc.setQueryData(keys.me, me);
}
