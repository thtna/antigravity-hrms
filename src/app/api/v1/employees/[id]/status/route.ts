import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guard';
import { EmployeeService } from '@/lib/services/employee.service';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

const StatusSchema = z.object({
  status: z.enum(['ACTIVE', 'TERMINATED', 'ON_LEAVE', 'PROBATION']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const { status } = await validateRequest(StatusSchema, body);

    const updated = await EmployeeService.toggleEmployeeStatus(id, status, session);

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        message:
          status === 'TERMINATED'
            ? 'Đã đình chỉ/chấm dứt hợp đồng nhân viên và khóa tài khoản hệ thống.'
            : 'Đã cập nhật trạng thái nhân viên thành công.',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
