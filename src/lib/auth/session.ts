import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { UserSession } from '@/types';
import { getAuthSecretKey } from './auth-secret';

/**
 * Dynamically resolves the session cookie name from AUTH_COOKIE_NAME environment variable,
 * falling back to 'antigravity_session'. Supports staging environments (e.g. antigravity_session_staging).
 */
export function getSessionCookieName(): string {
  return process.env.AUTH_COOKIE_NAME || 'antigravity_session';
}

export const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'antigravity_session';
const TOKEN_EXPIRY = process.env.AUTH_TOKEN_EXPIRATION || '7d';

/**
 * Signs a JWT session token with HS256 (fails closed if AUTH_SECRET is not configured)
 */
export async function signSessionToken(payload: UserSession): Promise<string> {
  const secretKey = getAuthSecretKey();
  if (!secretKey) {
    throw new Error(
      'Cấu hình bảo mật lỗi: AUTH_SECRET bắt buộc phải được thiết lập để ký phiên đăng nhập (Fail-Closed).'
    );
  }
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(secretKey);
}

/**
 * Verifies a JWT session token and returns the typed UserSession or null (fails closed if secret missing)
 */
export async function verifySessionToken(token: string): Promise<UserSession | null> {
  try {
    const secretKey = getAuthSecretKey();
    if (!secretKey) {
      return null;
    }
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });
    return payload as unknown as UserSession;
  } catch {
    return null;
  }
}

/**
 * Sets HttpOnly Secure session cookie in Next.js Server Components / Route Handlers
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: getSessionCookieName(),
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  });
}

/**
 * Clears session cookie on logout
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: getSessionCookieName(),
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Gets the current authenticated UserSession from incoming request cookies
 */
export async function getSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
