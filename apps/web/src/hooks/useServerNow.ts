import { useEffect, useState } from "react";
import { serverNow } from "@/store/board";

/** Ticks with the server-adjusted clock. Use sparingly: only small components subscribe. */
export function useServerNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
