/** Milliseconds left before `lastClaimAt + cooldownMs`, never negative. */
export function cooldownRemainingMs(lastClaimAt: Date | null, now: Date, cooldownMs: number): number {
  if (!lastClaimAt) return 0;
  return Math.max(0, lastClaimAt.getTime() + cooldownMs - now.getTime());
}

export function cooldownUntil(lastClaimAt: Date | null, now: Date, cooldownMs: number): Date | null {
  return cooldownRemainingMs(lastClaimAt, now, cooldownMs) > 0
    ? new Date(lastClaimAt!.getTime() + cooldownMs)
    : null;
}
