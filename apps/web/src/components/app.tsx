import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api";
import { keys, liveQueryOptions } from "@/lib/queries";
import { BoardShell } from "./board-shell";
import { JoinScreen } from "./join-screen";

export function App() {
  const me = useQuery({
    queryKey: keys.me,
    queryFn: () => api.me(),
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 1,
    ...liveQueryOptions,
  });

  if (me.isPending) {
    return (
      <main className="grid min-h-dvh place-items-center p-6" role="status" aria-label="Loading">
        <Skeleton className="h-64 w-full max-w-sm" />
      </main>
    );
  }
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) return <JoinScreen />;
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div role="alert" className="max-w-sm space-y-3 text-center">
          <h1 className="text-lg font-semibold">Can&apos;t reach GridBoard</h1>
          <p className="text-sm text-muted">The server isn&apos;t responding. Your session is safe — try again in a moment.</p>
          <Button onClick={() => me.refetch()}>Try again</Button>
        </div>
      </main>
    );
  }
  return <BoardShell session={me.data} />;
}
