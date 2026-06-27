import Redis from 'ioredis';
import { getConfig } from '@ghostpepe/config';

/**
 * Tiny KV abstraction over Redis with an in-memory fallback so the API and the
 * test suite work even without a running Redis. Used for: page-token cache,
 * import sessions, rate limiting, node desired-state cache.
 */
let redis: Redis | null = null;
const mem = new Map<string, { value: string; expiresAt: number | null }>();
let redisDown = false;

function client(): Redis | null {
  if (getConfig().NODE_ENV === 'test') return null;
  if (redisDown) return null;
  if (!redis) {
    redis = new Redis(getConfig().REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    redis.on('error', () => {
      redisDown = true;
    });
    redis.connect().catch(() => {
      redisDown = true;
    });
  }
  return redis;
}

export async function kvGet(key: string): Promise<string | null> {
  const c = client();
  if (c) {
    try {
      return await c.get(key);
    } catch {
      redisDown = true;
    }
  }
  const e = mem.get(key);
  if (!e) return null;
  if (e.expiresAt && e.expiresAt < Date.now()) {
    mem.delete(key);
    return null;
  }
  return e.value;
}

export async function kvSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const c = client();
  if (c) {
    try {
      if (ttlSeconds) await c.set(key, value, 'EX', ttlSeconds);
      else await c.set(key, value);
      return;
    } catch {
      redisDown = true;
    }
  }
  mem.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
}

export async function kvIncr(key: string, ttlSeconds: number): Promise<number> {
  const c = client();
  if (c) {
    try {
      const n = await c.incr(key);
      if (n === 1) await c.expire(key, ttlSeconds);
      return n;
    } catch {
      redisDown = true;
    }
  }
  const cur = Number((await kvGet(key)) ?? '0') + 1;
  await kvSet(key, String(cur), ttlSeconds);
  return cur;
}

export async function closeKv(): Promise<void> {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
