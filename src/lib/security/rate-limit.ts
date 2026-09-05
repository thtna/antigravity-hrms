interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * In-memory sliding window rate limiter for endpoint protection
 */
export function checkRateLimit(
  key: string,
  limit = 5,
  windowSeconds = 60
): { success: boolean; limit: number; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  // Clean up expired entry
  if (record && now > record.resetTime) {
    rateLimitStore.delete(key);
  }

  const currentRecord = rateLimitStore.get(key) || {
    count: 0,
    resetTime: now + windowSeconds * 1000,
  };

  if (currentRecord.count >= limit) {
    return {
      success: false,
      limit,
      remaining: 0,
      resetTime: Math.ceil((currentRecord.resetTime - now) / 1000),
    };
  }

  currentRecord.count += 1;
  rateLimitStore.set(key, currentRecord);

  return {
    success: true,
    limit,
    remaining: limit - currentRecord.count,
    resetTime: Math.ceil((currentRecord.resetTime - now) / 1000),
  };
}

/**
 * Resets rate limit for a key (e.g. on successful login)
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}
