import { NextResponse } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { ApiResponse } from '@/types';

export async function POST(): Promise<NextResponse<ApiResponse<{ message: string }>>> {
  const session = await getSession();

  if (session) {
    logger.info('User logging out', { userId: session.userId });
    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'LOGOUT',
        entity: 'users',
        entityId: session.userId,
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
