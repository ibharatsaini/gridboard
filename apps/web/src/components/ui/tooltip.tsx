import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";

/** Radix tooltip: keyboard-focusable, aria-describedby wired, Esc dismisses. */
export function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <T.Provider delayDuration={250}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content sideOffset={6} className="z-50 rounded-md bg-ink px-2 py-1 text-xs text-surface shadow-md">
            {label}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
