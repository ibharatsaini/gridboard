/** Remembers the last N event ids so a replayed/duplicated event is applied once. */
export function createDeduper(capacity = 500) {
  const seen = new Set<string>();
  return {
    /** Returns true the first time an id is seen. */
    firstTime(id: string): boolean {
      if (seen.has(id)) return false;
      seen.add(id);
      if (seen.size > capacity) seen.delete(seen.values().next().value as string);
      return true;
    },
    clear: () => seen.clear(),
  };
}

/** Newest-first list that can never grow past `limit`. */
export function prependBounded<T>(list: readonly T[] | undefined, item: T, limit: number): T[] {
  return [item, ...(list ?? [])].slice(0, limit);
}

/** Accept an event only if it is not older than the newest one already applied for its stream. */
export function createOrderGuard() {
  const latest = new Map<string, number>();
  return {
    accept(stream: string, isoTimestamp: string): boolean {
      const t = Date.parse(isoTimestamp);
      if (t < (latest.get(stream) ?? 0)) return false;
      latest.set(stream, t);
      return true;
    },
  };
}
