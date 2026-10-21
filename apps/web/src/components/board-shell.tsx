import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import type { SessionDTO } from "@gridboard/shared";
import { Button } from "@/components/ui/button";
import { Grid } from "@/components/grid/grid";
import { Header } from "@/components/layout/header";
import { StatsBar } from "@/components/layout/stats-bar";
import { useRealtime } from "@/hooks/useRealtime";
import { reconcile } from "@/lib/queries";
import { useBoardStore } from "@/store/board";

/**
 * Side panels are not needed for first paint: the grid is. They load as separate chunks after it, each behind a
 * placeholder of the same footprint so the layout does not jump when they arrive.
 */
const YourTerritory = lazy(() => import("@/components/panels/your-territory").then((m) => ({ default: m.YourTerritory })));
const Leaderboard = lazy(() => import("@/components/panels/leaderboard").then((m) => ({ default: m.Leaderboard })));
const ActivityFeed = lazy(() => import("@/components/panels/activity-feed").then((m) => ({ default: m.ActivityFeed })));

const PanelSkeleton = ({ height }: { height: string }) => (
  <div aria-hidden className={`${height} animate-pulse rounded-2xl border border-line bg-panel`} />
);

export function BoardShell({ session }: { session: SessionDTO }) {
  const qc = useQueryClient();
  useRealtime(true);

  useEffect(() => {
    useBoardStore.setState({ selfId: session.user.id });
  }, [session.user.id]);

  // Fallback initial load. Normally the socket's first `connect` reconciles; this makes the
  // board usable (REST still works) even if WebSockets are blocked.
  const boot = useQuery({
    queryKey: ["bootstrap"],
    queryFn: async () => (await reconcile(qc), true),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <Header user={session.user} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-3 px-3 pb-8 pt-3 sm:px-5">
        <StatsBar />
        {boot.isError ? (
          <div role="alert" className="grid place-items-center gap-3 rounded-2xl border border-line bg-panel p-10 text-center">
            <p className="font-medium">Couldn&apos;t load the board.</p>
            <p className="text-sm text-muted">Check your connection and try again.</p>
            <Button onClick={() => boot.refetch()}>Retry</Button>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section aria-label="Shared grid" className="h-[62dvh] min-h-[360px] lg:h-[calc(100dvh-190px)]">
              <Grid />
            </section>
            <aside className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Suspense fallback={<PanelSkeleton height="h-28" />}>
                <YourTerritory />
              </Suspense>
              <Suspense fallback={<PanelSkeleton height="h-72" />}>
                <Leaderboard selfId={session.user.id} />
              </Suspense>
              <div className="sm:col-span-2 lg:col-span-1">
                <Suspense fallback={<PanelSkeleton height="h-64" />}>
                  <ActivityFeed />
                </Suspense>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
