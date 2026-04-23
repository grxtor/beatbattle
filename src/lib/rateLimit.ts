import "server-only";
import { isIP } from "node:net";
import { getRedis } from "./redis";

/**
 * Sliding-window rate limiter.
 *
 * When `REDIS_URL` is configured we use a single-shot Lua script so
 * concurrent callers serialize atomically against the same window. If Redis
 * is unavailable (dev without it, or during a transient outage) we fall back
 * to an in-process Map — good enough for a single Node server and zero-config
 * local development.
 *
 * Usage:
 *   const { ok, retryAfter } = await rateLimit(`signup:${ip}`, RATE_LIMITS.signup);
 *   if (!ok) return tooManyRequests(retryAfter);
 */

export type RateLimitConfig = {
  max: number;
  windowMs: number;
};

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the caller can try again (0 when ok). */
  retryAfter: number;
  /** Requests remaining in the current window (0 when denied). */
  remaining: number;
};

// ---------- In-memory fallback ----------

type Bucket = { timestamps: number[] };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function memoryRateLimit(key: string, cfg: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowStart = now - cfg.windowMs;
  const bucket = buckets.get(key);
  const timestamps = (bucket?.timestamps ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= cfg.max) {
    const oldest = timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + cfg.windowMs - now) / 1000));
    buckets.set(key, { timestamps });
    return { ok: false, retryAfter, remaining: 0 };
  }

  timestamps.push(now);
  buckets.set(key, { timestamps });

  if (buckets.size > MAX_BUCKETS) memorySweep(windowStart);

  return {
    ok: true,
    retryAfter: 0,
    remaining: Math.max(0, cfg.max - timestamps.length),
  };
}

function memorySweep(windowStart: number): void {
  for (const [k, b] of buckets) {
    const fresh = b.timestamps.filter((t) => t > windowStart);
    if (fresh.length === 0) buckets.delete(k);
    else b.timestamps = fresh;
  }
}

// ---------- Redis sliding window (atomic Lua script) ----------

/**
 * ZADD a timestamp, trim the window, then ZCARD to count. All atomic so
 * two parallel callers can't both sneak past the limit.
 * KEYS[1] = bucket key
 * ARGV[1] = now (ms), ARGV[2] = windowStart (ms), ARGV[3] = max, ARGV[4] = ttlSec
 * Returns { allowed (0|1), count, oldestMs }.
 */
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowStart = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
local count = redis.call('ZCARD', key)
if count >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestMs = tonumber(oldest[2]) or now
  return {0, count, oldestMs}
end
redis.call('ZADD', key, now, now .. '-' .. math.random(0, 1000000))
redis.call('EXPIRE', key, ttl)
return {1, count + 1, now}
`.trim();

async function redisRateLimit(key: string, cfg: RateLimitConfig): Promise<RateLimitResult | null> {
  const client = getRedis();
  if (!client || client.status !== "ready") return null;

  const now = Date.now();
  const windowStart = now - cfg.windowMs;
  const ttlSec = Math.max(1, Math.ceil(cfg.windowMs / 1000) + 1);

  try {
    const res = (await client.eval(
      RATE_LIMIT_SCRIPT,
      1,
      `rl:${key}`,
      String(now),
      String(windowStart),
      String(cfg.max),
      String(ttlSec),
    )) as [number, number, number];
    const [allowed, count, oldestMs] = res;

    if (allowed === 0) {
      const retryAfter = Math.max(
        1,
        Math.ceil((oldestMs + cfg.windowMs - now) / 1000),
      );
      return { ok: false, retryAfter, remaining: 0 };
    }
    return {
      ok: true,
      retryAfter: 0,
      remaining: Math.max(0, cfg.max - count),
    };
  } catch (err) {
    console.error("[rateLimit] redis failed, falling back to memory", err);
    return null;
  }
}

// ---------- Public API ----------

export async function rateLimit(
  key: string,
  cfg: RateLimitConfig,
): Promise<RateLimitResult> {
  const redisResult = await redisRateLimit(key, cfg);
  if (redisResult) return redisResult;
  return memoryRateLimit(key, cfg);
}

function normalizeIp(raw: string | null): string | null {
  if (!raw) return null;

  let candidate = raw.trim().replace(/^for=/i, "").replace(/^"|"$/g, "");
  if (!candidate) return null;

  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (
    candidate.includes(":") &&
    candidate.indexOf(":") === candidate.lastIndexOf(":")
  ) {
    const [host, port] = candidate.split(":");
    if (host && port && /^\d+$/.test(port) && isIP(host)) {
      candidate = host;
    }
  }

  return isIP(candidate) ? candidate : null;
}

/** Pull a best-effort client IP from typical proxy headers. */
export function clientIpFrom(headers: Headers): string {
  const cfConnectingIp = normalizeIp(headers.get("cf-connecting-ip"));
  if (cfConnectingIp) return cfConnectingIp;

  const realIp = normalizeIp(headers.get("x-real-ip"));
  if (realIp) return realIp;

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const forwardedIps = forwardedFor
      .split(",")
      .map((part) => normalizeIp(part))
      .filter((part): part is string => !!part);

    if (forwardedIps.length > 0) {
      return forwardedIps[forwardedIps.length - 1];
    }
  }

  return "unknown";
}

/** 429 JSON response with Retry-After header. */
export function tooManyRequests(retryAfter: number, body: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ error: "too many requests", retryAfter, ...body }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}

/** Commonly-used presets, grouped in one place so policy lives together. */
export const RATE_LIMITS = {
  signup: { max: 5, windowMs: 10 * 60_000 },
  loginAttempt: { max: 10, windowMs: 10 * 60_000 },
  roomCreate: { max: 5, windowMs: 10 * 60_000 },
  friendRequest: { max: 20, windowMs: 10 * 60_000 },
  roomJoin: { max: 30, windowMs: 60_000 },
  quickMatch: { max: 15, windowMs: 60_000 },
  shopBuy: { max: 10, windowMs: 60_000 },
  presence: { max: 4, windowMs: 60_000 },
  roomInvite: { max: 15, windowMs: 10 * 60_000 },
  voteCast: { max: 30, windowMs: 60_000 },
  submitTrack: { max: 10, windowMs: 60_000 },
  roomMutation: { max: 60, windowMs: 60_000 },
  friendshipWrite: { max: 60, windowMs: 10 * 60_000 },
  notificationRead: { max: 120, windowMs: 60_000 },
  profileWrite: { max: 30, windowMs: 10 * 60_000 },
  passwordChange: { max: 5, windowMs: 10 * 60_000 },
  accountDelete: { max: 3, windowMs: 60 * 60_000 },
  chatSend: { max: 15, windowMs: 10_000 },
  trackUpload: { max: 6, windowMs: 60_000 },
  samplesZip: { max: 5, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>;
