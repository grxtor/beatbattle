import "server-only";
import Redis from "ioredis";

/**
 * Shared Redis client.
 *
 * We attach the instance to `globalThis` so hot-reload in dev doesn't open
 * a new connection every edit. When `REDIS_URL` is unset the getter returns
 * `null` so callers can gracefully fall back (e.g. the in-memory rate limiter
 * still works locally without Redis).
 */

type GlobalWithRedis = typeof globalThis & {
  __beatbattleRedis?: Redis | null;
};

function createClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    reconnectOnError: () => 1,
  });

  client.on("error", (err) => {
    console.error("[redis] error", err.message);
  });

  void client.connect().catch((err) => {
    console.error("[redis] connect failed", err.message);
  });

  return client;
}

const g = globalThis as GlobalWithRedis;
if (!("__beatbattleRedis" in g)) {
  g.__beatbattleRedis = createClient();
}

export function getRedis(): Redis | null {
  return g.__beatbattleRedis ?? null;
}
