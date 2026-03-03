import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_URL;
    const token = process.env.UPSTASH_REDIS_TOKEN;

    if (!url || !token) {
      throw new Error('UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN must be set');
    }

    redis = new Redis({ url, token });
  }
  return redis;
}

/**
 * Check if Redis is configured (for graceful fallback in dev).
 */
export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN);
}

// ── Rate limiters ──

/** General API: 60 requests per minute per IP */
export const apiRateLimit = isRedisConfigured()
  ? new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      prefix: 'rl:api',
    })
  : null;

/** Auth endpoints: 10 attempts per minute per IP */
export const authRateLimit = isRedisConfigured()
  ? new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, '1 m'),
      prefix: 'rl:auth',
    })
  : null;

/** AI portrait generation: 5 per minute per guest */
export const aiRateLimit = isRedisConfigured()
  ? new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(5, '1 m'),
      prefix: 'rl:ai',
    })
  : null;

// ── Caching helpers ──

const DEFAULT_TTL = 300; // 5 minutes

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!isRedisConfigured()) return null;
  return getRedis().get<T>(key);
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL): Promise<void> {
  if (!isRedisConfigured()) return;
  await getRedis().set(key, value, { ex: ttlSeconds });
}

export async function cacheDelete(key: string): Promise<void> {
  if (!isRedisConfigured()) return;
  await getRedis().del(key);
}

/**
 * Cache wedding config by slug. Short TTL since couples may edit settings.
 */
export async function cacheWeddingConfig(slug: string, config: unknown): Promise<void> {
  await cacheSet(`wedding:${slug}:config`, config, 60);
}

export async function getCachedWeddingConfig<T>(slug: string): Promise<T | null> {
  return cacheGet<T>(`wedding:${slug}:config`);
}
