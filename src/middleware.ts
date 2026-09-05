import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { UserSession } from './types';

const SECRET_KEY = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'antigravity_super_secret_jwt_key_minimum_32_characters_long_for_security'
);
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'antigravity_session';

/**
 * Appends standard security headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy)
 */
function applySecurityHeaders(res: NextResponse): NextResponse {
  // Prevent clickjacking
  res.headers.set('X-Frame-Options', 'DENY');
  // Prevent MIME type confusion attacks
  res.headers.set('X-Content-Type-Options', 'nosniff');
  // Referrer Policy
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Restrict sensitive browser permissions
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self)'
  );
  // Content Security Policy
  res.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self'"
  );
  // Strict Transport Security (HSTS)
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  return res;
}

/**
 * Validates Origin/Referer header against Host on state-mutating requests (CSRF Defense)
 */
function verifyCsrfOrigin(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return true; // Idempotent read operations are safe
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  // If host is missing (e.g. some internal tests), allow
  if (!host) return true;

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return false;
      }
    } catch {
      return false;
    }
  } else if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost !== host) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. CSRF Protection for API Mutations
  if (pathname.startsWith('/api/') && !verifyCsrfOrigin(request)) {
    return applySecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Yêu cầu bị từ chối do nguồn gốc không hợp lệ (CSRF Protection Blocked).',
          },
        },
        { status: 403 }
      )
    );
  }

  // Allow public routes and static assets
  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/unauthorized' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/v1/auth/login') ||
    pathname.includes('.')
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Check session cookie
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    // If API request, return 401 JSON
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Yêu cầu xác thực tài khoản. Vui lòng đăng nhập.',
            },
          },
          { status: 401 }
        )
      );
    }

    // If Web page request, redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, {
      algorithms: ['HS256'],
    });
    const session = payload as unknown as UserSession;

    // Check account active status
    if (!session.isActive) {
      if (pathname.startsWith('/api/')) {
        return applySecurityHeaders(
          NextResponse.json(
            {
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Tài khoản đã bị vô hiệu hóa.',
              },
            },
            { status: 403 }
          )
        );
      }
      return applySecurityHeaders(
        NextResponse.redirect(new URL('/login?error=account_inactive', request.url))
      );
    }

    // Role-based route checking
    if (pathname.startsWith('/admin') && !session.roles.includes('admin')) {
      return applySecurityHeaders(NextResponse.redirect(new URL('/unauthorized', request.url)));
    }

    if (
      pathname.startsWith('/hr') &&
      !session.roles.includes('admin') &&
      !session.roles.includes('hr')
    ) {
      return applySecurityHeaders(NextResponse.redirect(new URL('/unauthorized', request.url)));
    }

    if (
      pathname.startsWith('/manager') &&
      !session.roles.includes('admin') &&
      !session.roles.includes('hr') &&
      !session.roles.includes('manager')
    ) {
      return applySecurityHeaders(NextResponse.redirect(new URL('/unauthorized', request.url)));
    }

    // Attach user metadata to request headers for downstream handlers
    const response = NextResponse.next();
    response.headers.set('x-user-id', session.userId);
    response.headers.set('x-user-roles', session.roles.join(','));
    return applySecurityHeaders(response);
  } catch {
    // Invalid/expired token
    if (pathname.startsWith('/api/')) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
            },
          },
          { status: 401 }
        )
      );
    }
    return applySecurityHeaders(
      NextResponse.redirect(new URL('/login?error=session_expired', request.url))
    );
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/hr/:path*',
    '/manager/:path*',
    '/portal/:path*',
    '/api/v1/:path*',
  ],
};
