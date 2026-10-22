import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import type { Logger } from "../config/logger";
import { RATE_LIMITS, type RateLimiter, type RateLimiters, type RedisPort } from "./types";

export function createUpstashRest(url: string, token: string): Redis {
  return new Redis({ url, token, automaticDeserialization: false });
}

export class UpstashRedisPort implements RedisPort {
  constructor(private readonly redis: Redis) {}

  async setNx(key: string, ttlMs: number): Promise<boolean> {
    const res = await this.redis.set(key, "1", { nx: true, px: ttlMs });
    return res === "OK";
  }

  async ttlMs(key: string): Promise<number> {
    const ms = await this.redis.pttl(key);
    return ms > 0 ? ms : 0;
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async lock(key: string, owner: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(key, owner, { nx: true, px: ttlMs })) === "OK";
  }

  async unlock(key: string, owner: string): Promise<void> {
    await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      [key],
      [owner],
    );
  }

  async zaddMany(key: string, entries: ReadonlyArray<{ member: string; score: number }>): Promise<void> {
    const [first, ...rest] = entries;
    if (!first) return;
    await this.redis.zadd(key, first, ...rest);
  }

  async zrem(key: string, members: readonly string[]): Promise<void> {
    if (members.length === 0) return;
    await this.redis.zrem(key, ...members);
  }

  async zmembersFrom(key: string, minScore: number): Promise<string[]> {
    return (await this.redis.zrange<string[]>(key, minScore, "+inf", { byScore: true })).map(String);
  }

  async zremBelow(key: string, maxScoreExclusive: number): Promise<void> {
    await this.redis.zremrangebyscore(key, "-inf", `(${maxScoreExclusive}`);
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }
}

/**
 * Wraps @upstash/ratelimit so a Redis outage degrades to "allow + log" instead of
 * taking the whole API down. Correctness never depends on this limiter: ownership is
 * decided by Postgres and the cooldown is enforced durably in the claim transaction.
 */
class FailOpenLimiter implements RateLimiter {
  constructor(
    private readonly inner: Ratelimit,
    private readonly name: string,
    private readonly requests: number,
    private readonly logger: Logger,
  ) {}

  async limit(identifier: string) {
    try {
      const res = await this.inner.limit(identifier);
      return {
        success: res.success,
        limit: res.limit,
        remaining: res.remaining,
        retryAfterMs: Math.max(0, res.reset - Date.now()),
        // @upstash/ratelimit resolves {success:true, reason:"timeout"} when Redis is too slow.
        degraded: res.reason === "timeout",
      };
    } catch (err) {
      this.logger.error({ event: "redis_error", op: `ratelimit:${this.name}`, err }, "rate limiter unavailable; failing open");
      return { success: true, limit: this.requests, remaining: this.requests, retryAfterMs: 0, degraded: true };
    }
  }
}

export function createUpstashRateLimiters(redis: Redis, logger: Logger): RateLimiters {
  const make = (name: keyof typeof RATE_LIMITS): RateLimiter => {
    const cfg = RATE_LIMITS[name];
    return new FailOpenLimiter(
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(cfg.requests, `${cfg.windowSeconds} s`),
        prefix: `gb:rl:${name}`,
        // Don't let a slow Redis stall every claim: give up after 1.5s and allow.
        timeout: 1500,
        analytics: false,
      }),
      name,
      cfg.requests,
      logger,
    );
  };
  return { join: make("join"), claimPerUser: make("claimPerUser"), claimPerIp: make("claimPerIp") };
}
