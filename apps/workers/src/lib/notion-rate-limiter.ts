/**
 * Token bucket rate limiter for Notion API requests.
 *
 * Notion enforces a maximum of 3 requests per second per integration.
 * This implementation uses a simple token bucket algorithm:
 * - Bucket capacity: 3 tokens
 * - Refill rate: 3 tokens/second
 * - If no tokens available, wait until one becomes available
 *
 * Each integration (by integrationId) has its own bucket to prevent
 * one tenant's polling from starving another.
 */

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const BUCKET_CAPACITY = 3;
const REFILL_RATE = 3; // tokens per second

/** Per-integration buckets */
const buckets = new Map<string, TokenBucket>();

/**
 * Get or create a token bucket for the given integration.
 */
function getBucket(integrationId: string): TokenBucket {
  let bucket = buckets.get(integrationId);
  if (!bucket) {
    bucket = { tokens: BUCKET_CAPACITY, lastRefill: Date.now() };
    buckets.set(integrationId, bucket);
  }
  return bucket;
}

/**
 * Refill tokens based on elapsed time since last refill.
 */
function refill(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000; // seconds
  const tokensToAdd = elapsed * REFILL_RATE;

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }
}

/**
 * Acquire a token from the rate limiter.
 * If no tokens are available, waits until one becomes available.
 *
 * @param integrationId - Unique identifier for the integration
 * @returns Promise that resolves when a token is acquired
 */
export async function acquireToken(integrationId: string): Promise<void> {
  const bucket = getBucket(integrationId);
  refill(bucket);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return;
  }

  // Calculate wait time until next token is available
  const deficit = 1 - bucket.tokens;
  const waitMs = Math.ceil((deficit / REFILL_RATE) * 1000);

  await new Promise((resolve) => setTimeout(resolve, waitMs));

  // After waiting, refill and consume
  refill(bucket);
  bucket.tokens = Math.max(0, bucket.tokens - 1);
}

/**
 * Reset the rate limiter for a specific integration (for testing).
 */
export function resetBucket(integrationId: string): void {
  buckets.delete(integrationId);
}

/**
 * Reset all rate limiter buckets (for testing).
 */
export function resetAllBuckets(): void {
  buckets.clear();
}

/** Exported for testing */
export { BUCKET_CAPACITY, REFILL_RATE };
