export interface RedisPort {
  /** SET key value NX PX ttl. Resolves true if the key was created. */
  setNx(key: string, ttlMs: number): Promise<boolean>;
  /** Remaining TTL in ms; 0 if the key does not exist. */
  ttlMs(key: string): Promise<number>;
  del(key: string): Promise<void>;
  /** SET key owner NX PX ttl. Resolves true if this caller now holds the lock. */
  lock(key: string, owner: string, ttlMs: number): Promise<boolean>;
  /** Delete the lock only if `owner` still holds it (compare-and-delete). */
  unlock(key: string, owner: string): Promise<void>;
  zaddMany(
    key: string,
    entries: ReadonlyArray<{ member: string; score: number }>,
  ): Promise<void>;
  zrem(key: string, members: readonly string[]): Promise<void>;
  /** Members whose score is >= min. */
  zmembersFrom(key: string, minScore: number): Promise<string[]>;
  zremBelow(key: string, maxScoreExclusive: number): Promise<void>;
  ping(): Promise<void>;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  /** True when Redis was unreachable and the request was allowed anyway. */
  degraded?: boolean;
}

export interface RateLimiter {
  limit(identifier: string): Promise<RateLimitResult>;
}

export interface RateLimiters {
  join: RateLimiter;
  claimPerUser: RateLimiter;
  claimPerIp: RateLimiter;
}

export const RATE_LIMITS = {
  /** 5s cooldown means ~2 legit attempts per 5s; 10/10s leaves headroom for retries and double clicks. */
  claimPerUser: { requests: 10, windowSeconds: 10 },
  /** Shared NATs (offices, campuses) must not starve each other. */
  claimPerIp: { requests: 100, windowSeconds: 10 },
  /** Account creation is the abuse vector; keep it tight. */
  join: { requests: 10, windowSeconds: 60 },
} as const;
