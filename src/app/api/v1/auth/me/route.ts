import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/errors';
import { ApiResponse, SanitizedUser } from '@/types';

function attachServerTiming<T>(
  response: NextResponse<T>,
  timings: { authMs: number; userQueryMs: number; totalMs: number }
): NextResponse<T> {
  if (process.env.VERCEL_ENV !== 'production') {
    response.headers.set(
      'Server-Timing',
      [
        `auth;dur=${timings.authMs.toFixed(1)}`,
        `user_query;dur=${timings.userQueryMs.toFixed(1)}`,
        `total;dur=${timings.totalMs.toFixed(1)}`,
      ].join(', ')
    );
  }
  return response;
}

export async function GET(): Promise<NextResponse<ApiResponse<SanitizedUser>>> {
  const routeStart = performance.now();
  let authMs = 0;
  let userQueryMs = 0;

  try {
    const authStart = performance.now();
    const session = await requireAuth();
    authMs = performance.now() - authStart;

    const userQueryStart = performance.now();
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        employee: true,
      },
    });
    userQueryMs = performance.now() - userQueryStart;

    if (!user || !user.isActive) {
      return attachServerTiming(
        NextResponse.json<ApiResponse<SanitizedUser>>(
          {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.',
            },
          },
          { status: 401 }
        ),
        {
          authMs,
          userQueryMs,
          totalMs: performance.now() - routeStart,
        }
      );
    }

    const sanitized: SanitizedUser = {
      id: user.id,
      email: user.email,
      fullName: session.fullName,
      isActive: user.isActive,
      employeeId: user.employee?.id,
      departmentId: user.employee?.departmentId || null,
      roles: session.roles,
      permissions: session.permissions,
      lastLoginAt: user.lastLoginAt,
    };

    return attachServerTiming(
      NextResponse.json<ApiResponse<SanitizedUser>>({
        success: true,
        data: sanitized,
        meta: {
          timestamp: new Date().toISOString(),
        },
      }),
      {
        authMs,
        userQueryMs,
        totalMs: performance.now() - routeStart,
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
