import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { ApiResponse } from '@/types';

export async function POST(request?: NextRequest): Promise<NextResponse<ApiResponse<{ message: string }>>> {
  const session = await getSession();

  if (session) {
    logger.info('User logging out', {
      userId: session.userId,
      organizationId: session.organizationId || null,
    });

    const ipAddress = request
      ? request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1'
      : null;
    const userAgent = request ? request.headers.get('user-agent') : null;

    await prisma.auditLog.create({
      data: {
        organizationId: session.organizationId || null,
        actorId: session.userId,
        action: 'LOGOUT',
        entity: 'users',
        entityId: session.userId,
        ipAddress,
        userAgent,
      },
    }).catch(() => {});
  }

  await clearSessionCookie();

  return NextResponse.json({
    success: true,
    data: {
      message: 'Đăng xuất thành công.',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
