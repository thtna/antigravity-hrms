import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { handleApiError } from '@/lib/errors';
import { PermissionService } from '@/lib/services/permission.service';
import { ApiResponse } from '@/types';
import { z } from 'zod';
import { validateRequest } from '@/lib/validations';

const AssignRolesSchema = z.object({
  targetUserId: z.string().uuid('ID người dùng không hợp lệ'),
  roleCodes: z.array(z.string()).min(1, 'Phải chỉ định ít nhất một vai trò'),
});

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const validated = await validateRequest(AssignRolesSchema, body);

    const clientInfo = {
      ipAddress: request.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: request.headers.get('user-agent') || undefined,
    };

    const result = await PermissionService.assignUserRoles(validated, session, clientInfo);

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        message: 'Cập nhật phân quyền tài khoản thành công.',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
