import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Activity } from "lucide-react";
import { useServerNow } from "@/hooks/useServerNow";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { keys, liveQueryOptions } from "@/lib/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { Dot, Panel } from "./panel";

export function ActivityFeed() {
  const { data } = useQuery({ queryKey: keys.activity, queryFn: api.activity, ...liveQueryOptions });
  const now = useServerNow(5000);
  return (
    <Panel id="activity-h" title="Live activity" aside={<Activity aria-hidden className="size-3.5 text-muted" />}>
      {!data ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-5" />)}</div>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted">Quiet so far. Claim a cell and you&apos;ll be the first entry.</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1" aria-live="off">
          <AnimatePresence initial={false}>
            {data.map((a) => (
              <motion.li
                key={a.id}
                layout="position"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-sm"
              >
                <Dot color={a.user.color} />
                <span className="min-w-0 flex-1 truncate">
                  <strong className="font-medium">{a.user.displayName}</strong>{" "}
                  <span className="text-muted">{a.kind === "CLAIM" ? <>claimed <span className="font-medium text-ink">{a.cellLabel}</span></> : "joined the board"}</span>
                </span>
                <time dateTime={a.at} className="shrink-0 text-xs text-muted">{timeAgo(a.at, now)}</time>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  );
}
