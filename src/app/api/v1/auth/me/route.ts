import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/errors';
import { ApiResponse, SanitizedUser } from '@/types';

export async function GET(): Promise<NextResponse<ApiResponse<SanitizedUser>>> {
  try {
    const session = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        employee: true,
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.',
          },
        },
        { status: 401 }
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

    return NextResponse.json({
      success: true,
      data: sanitized,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
