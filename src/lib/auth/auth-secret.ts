/**
 * ==============================================================================
 * ANTIGRAVITY HRMS — EDGE-COMPATIBLE AUTH SECRET RESOLVER
 * ==============================================================================
 *
 * Provides synchronized, fail-closed JWT secret resolution for both:
 * 1. Edge Middleware (src/middleware.ts)
 * 2. Node.js Server Runtime (src/lib/auth/session.ts)
 *
 * Security Requirements:
 * - Production (APP_ENV === 'production' or NODE_ENV === 'production'):
 *   AUTH_SECRET MUST be explicitly configured.
 *   If missing or empty, fails closed (returns null).
 *   Silent fallback to JWT_SECRET or hardcoded strings is STRICTLY PROHIBITED in Production.
 * - Non-Production (dev/test):
 *   Prefers AUTH_SECRET.
 *   Fallback to JWT_SECRET is permitted ONLY outside Production for backward compatibility.
 *   If neither is configured, returns null (zero hardcoded fallback).
 */

export function getAuthSecretString(): string | null {
  const isProduction =
    process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  const authSecret = process.env.AUTH_SECRET?.trim();

  if (isProduction) {
    if (!authSecret) {
      return null;
    }
    return authSecret;
  }

  // Non-production environments:
  if (authSecret) {
    return authSecret;
  }

  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (jwtSecret) {
    return jwtSecret;
  }

  return null;
}

/**
 * Returns Uint8Array encoded key compatible with jose SignJWT / jwtVerify in Edge and Node runtimes.
 * Returns null if secret is not configured (fail closed).
 */
export function getAuthSecretKey(): Uint8Array | null {
  const secret = getAuthSecretString();
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}
