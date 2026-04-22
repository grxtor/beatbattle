import "server-only";

/**
 * In-process sliding-window rate limiter.
 *
 * Good enough for a single Node server (dev + small prod). When this app
 * starts running on multiple instances (multiple pods, edge runtime, …)
 * swap this for a Redis-backed implementation behind the same interface.
 *
 * Usage:
 *   const { ok, retryAfter } = rateLimit(`signup:${ip}`, { max: 5, windowMs: 10 * 60_000 });
 *   if (!ok) return tooMany(retryAfter);
 */

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

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

export function rateLimit(key: string, cfg: RateLimitConfig): RateLimitResult {
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

  if (buckets.size > MAX_BUCKETS) sweep(windowStart);

  return {
    ok: true,
    retryAfter: 0,
    remaining: Math.max(0, cfg.max - timestamps.length),
  };
}

function sweep(windowStart: number): void {
  for (const [k, b] of buckets) {
    const fresh = b.timestamps.filter((t) => t > windowStart);
    if (fresh.length === 0) buckets.delete(k);
    else b.timestamps = fresh;
  }
}

/** Pull a best-effort client IP from typical proxy headers. */
export function clientIpFrom(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    "unknown"
  );
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
  signup: { max: 5, windowMs: 10 * 60_000 }, // 5 per 10 min per IP
  loginAttempt: { max: 10, windowMs: 10 * 60_000 }, // 10 per 10 min per IP+username
  friendRequest: { max: 20, windowMs: 10 * 60_000 }, // 20 per 10 min per user
  roomJoin: { max: 30, windowMs: 60_000 }, // 30 per min per user
  quickMatch: { max: 15, windowMs: 60_000 }, // 15 per min per user
  shopBuy: { max: 10, windowMs: 60_000 }, // 10 per min per user
  presence: { max: 4, windowMs: 60_000 }, // client pings every 30s → allow 4
  roomInvite: { max: 15, windowMs: 10 * 60_000 }, // 15 per 10 min per inviter
  voteCast: { max: 30, windowMs: 60_000 }, // 30 per min per voter (covers re-votes)
  submitTrack: { max: 10, windowMs: 60_000 }, // 10 per min per user
  roomMutation: { max: 60, windowMs: 60_000 }, // leave/ready/start — generous, just spam guard
  friendshipWrite: { max: 60, windowMs: 10 * 60_000 }, // accept/decline/unfriend
  notificationRead: { max: 120, windowMs: 60_000 }, // clicking to read
  profileWrite: { max: 30, windowMs: 10 * 60_000 }, // settings updates
  passwordChange: { max: 5, windowMs: 10 * 60_000 }, // stricter — security-sensitive
  accountDelete: { max: 3, windowMs: 60 * 60_000 }, // 3 per hour — accident guard
} as const satisfies Record<string, RateLimitConfig>;
