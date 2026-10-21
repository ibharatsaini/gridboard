import { useQuery } from "@tanstack/react-query";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { keys, liveQueryOptions } from "@/lib/queries";

export function StatsBar() {
  const { data: stats } = useQuery({ queryKey: keys.stats, queryFn: api.stats, ...liveQueryOptions });
  const { data: me } = useQuery({ queryKey: keys.me, queryFn: api.me, ...liveQueryOptions });
  const items: Array<[string, number | undefined]> = [
    ["Total cells", stats?.totalCells],
    ["Claimed", stats?.claimed],
    ["Available", stats?.available],
    ["Your cells", me?.stats.cells],
    ["Your territories", me?.stats.territories],
    ["Online", stats?.online],
  ];
  return (
    <dl aria-label="Board statistics" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-line bg-panel px-3 py-2">
          <dt className="text-[11px] text-muted">{label}</dt>
          <dd className="text-lg font-semibold leading-tight">{value === undefined ? <Skeleton className="mt-1 h-5 w-12" /> : <AnimatedNumber value={value} />}</dd>
        </div>
      ))}
    </dl>
  );
}
