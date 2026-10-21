import { useQuery } from "@tanstack/react-query";
import { CLAIM_COOLDOWN_MS } from "@gridboard/shared";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerNow } from "@/hooks/useServerNow";
import { api } from "@/lib/api";
import { keys, liveQueryOptions } from "@/lib/queries";
import { Panel } from "./panel";

function CooldownMeter({ until }: { until: string | null }) {
  const t = until ? Date.parse(until) : 0;
  const now = useServerNow(100);
  const remaining = Math.max(0, t - now);
  const ready = remaining === 0;
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">Claim cooldown</span>
        <span role="timer" className={ready ? "font-medium text-green-700 dark:text-green-400" : "font-medium"}>
          {ready ? "Ready" : `Next claim in ${(remaining / 1000).toFixed(1)}s`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-[width] duration-100" style={{ width: `${ready ? 100 : (1 - remaining / CLAIM_COOLDOWN_MS) * 100}%` }} />
      </div>
    </div>
  );
}

export function YourTerritory() {
  const { data: me } = useQuery({ queryKey: keys.me, queryFn: api.me, ...liveQueryOptions });
  const s = me?.stats;
  return (
    <Panel id="territory-h" title="Your territory" aside={me && <span className="size-3 rounded-full" style={{ backgroundColor: me.user.color }} />}>
      {!s ? (
        <Skeleton className="h-16" />
      ) : s.cells === 0 ? (
        <p className="text-sm text-muted">You hold no cells yet. Click any open cell to plant your flag.</p>
      ) : (
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[["Cells", s.cells], ["Territories", s.territories], ["Score", s.score]].map(([k, v]) => (
            <div key={k as string} className="rounded-lg bg-surface py-2">
              <dd className="text-lg font-semibold"><AnimatedNumber value={v as number} /></dd>
              <dt className="text-[11px] text-muted">{k}</dt>
            </div>
          ))}
        </dl>
      )}
      {s && <CooldownMeter until={s.cooldownUntil} />}
    </Panel>
  );
}
