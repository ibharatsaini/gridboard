import type { ReactNode } from "react";

export function Panel({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-line bg-panel p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 id={id} className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export const Dot = ({ color }: { color?: string }) => (
  <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
);
