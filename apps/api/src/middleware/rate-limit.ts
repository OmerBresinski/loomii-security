import { createMiddleware } from "hono/factory";
import type { Redis } from "ioredis";
import { createRedisConnection } from "@loomii/queue";

const RATE_LIMIT = 100;
const WINDOW_SECONDS = 60;

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = createRedisConnection();
  }
  return redis;
}

/**
 * Returns the current minute window key for a given user.
 * Format: ratelimit:{userId}:{minuteTimestamp}
 */
function getRateLimitKey(userId: string): string {
  const windowStart = Math.floor(Date.now() / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
  return `ratelimit:${userId}:${windowStart}`;
}

/**
 * Seconds remaining until the current window resets.
 */
function getSecondsUntilReset(): number {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / WINDOW_SECONDS) * WINDOW_SECONDS;
  return WINDOW_SECONDS - (now - windowStart);
}

export const rateLimiter = createMiddleware(async (c, next) => {
  const userId = c.get("userId") as string | undefined;

  // Skip rate limiting if no user (pre-auth routes)
  if (!userId) {
    await next();
    return;
  }

  const client = getRedis();
  const key = getRateLimitKey(userId);
  const resetIn = getSecondsUntilReset();

  // Atomic increment + set expiry
  const results = await client
    .multi()
    .incr(key)
    .expire(key, WINDOW_SECONDS)
    .exec();

  const count = (results?.[0]?.[1] as number) ?? 1;
  const remaining = Math.max(0, RATE_LIMIT - count);

  // Set rate limit headers on every response
  c.header("X-RateLimit-Limit", String(RATE_LIMIT));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(resetIn));

  if (count > RATE_LIMIT) {
    c.header("Retry-After", String(resetIn));
    return c.json(
      {
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Rate limit exceeded. Please try again later.",
          requestId: c.get("requestId") as string,
        },
      },
      429
    );
  }

  await next();
});
