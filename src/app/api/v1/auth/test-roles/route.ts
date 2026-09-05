import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { handleApiError } from '@/lib/errors';
import { ApiResponse, RoleCode } from '@/types';

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ message: string; roleTested: string }>>> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requiredRole = (searchParams.get('role') || 'admin') as RoleCode;

    const session = await requireRole([requiredRole]);

    return NextResponse.json({
      success: true,
      data: {
        message: `Xác thực vai trò thành công: Bạn có quyền truy cập vai trò [${requiredRole}]`,
        roleTested: requiredRole,
        validatedUserId: session.userId,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
