import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DropdownMenu } from "radix-ui";
import { motion } from "motion/react";
import { ChevronDown, Grid3x3, LogOut, Users } from "lucide-react";
import type { UserDTO } from "@gridboard/shared";
import { api } from "@/lib/api";
import { keys, liveQueryOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useViewStore, type ConnectionStatus } from "@/store/view";

const STATUS: Record<ConnectionStatus, { label: string; dot: string }> = {
  connecting: { label: "Connecting", dot: "bg-amber-500" },
  live: { label: "Live", dot: "bg-green-500" },
  reconnecting: { label: "Reconnecting", dot: "bg-amber-500" },
  offline: { label: "Offline", dot: "bg-red-500" },
};

export function ConnectionBadge() {
  const status = useViewStore((s) => s.status);
  const { label, dot } = STATUS[status];
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs font-medium">
      <span className="relative flex size-2">
        {status !== "live" && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", dot)} />}
        <span className={cn("relative inline-flex size-2 rounded-full", dot)} />
      </span>
      {label}
    </div>
  );
}

export function Header({ user }: { user: UserDTO }) {
  const qc = useQueryClient();
  const { data: stats } = useQuery({ queryKey: keys.stats, queryFn: api.stats, ...liveQueryOptions });
  const leave = async () => {
    await api.logout().catch(() => undefined);
    qc.clear();
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-panel/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-3 px-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-ink text-surface"><Grid3x3 className="size-4" aria-hidden /></span>
          <span className="text-sm font-semibold tracking-wide">GRIDBOARD</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-1.5 text-xs font-medium sm:flex" aria-label={`${stats?.online ?? 0} online`}>
            <Users className="size-3.5 text-muted" aria-hidden />
            <motion.span key={stats?.online} initial={{ opacity: 0.4, y: -3 }} animate={{ opacity: 1, y: 0 }}>{stats?.online ?? "–"}</motion.span>
            online
          </div>
          <ConnectionBadge />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-line/60" aria-label={`Account menu for ${user.displayName}`}>
              <span className="size-3 rounded-full" style={{ backgroundColor: user.color }} aria-hidden />
              <span className="max-w-24 truncate">{user.displayName}</span>
              <ChevronDown className="size-3.5 text-muted" aria-hidden />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-40 rounded-xl border border-line bg-panel p-1 shadow-lg">
                <DropdownMenu.Item onSelect={leave} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-line/60">
                  <LogOut className="size-4" aria-hidden /> Leave board
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}
