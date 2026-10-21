import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { keys, liveQueryOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Dot, Panel } from "./panel";

export function Leaderboard({ selfId }: { selfId: string }) {
  const { data } = useQuery({ queryKey: keys.leaderboard, queryFn: api.leaderboard, ...liveQueryOptions });
  return (
    <Panel id="leaderboard-h" title="Leaderboard" aside={<Trophy aria-hidden className="size-3.5 text-muted" />}>
      {!data ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-7" />)}</div>
      ) : data.entries.length === 0 ? (
        <p className="text-sm text-muted">Nobody has claimed anything yet. The top spot is wide open.</p>
      ) : (
        <ol className="space-y-1">
          <AnimatePresence initial={false}>
            {data.entries.map((e) => (
              <motion.li
                key={e.user.id}
                layout="position"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", e.user.id === selfId && "bg-accent/10")}
              >
                <span className="w-4 text-xs font-medium text-muted">{e.rank}</span>
                <Dot color={e.user.color} />
                <span className="min-w-0 flex-1 truncate">{e.user.displayName}{e.user.id === selfId && <span className="text-muted"> (you)</span>}</span>
                <span className="text-xs text-muted" title={`${e.cells} cells in ${e.territories} territories`}>{e.cells}c</span>
                <span className="w-9 text-right font-semibold">{e.score}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </Panel>
  );
}
