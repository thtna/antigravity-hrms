import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { AttendanceService } from '@/lib/services/attendance.service';
import { CheckOutSchema } from '@/lib/validations/attendance';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * POST /api/v1/attendance/check-out
 * Check-out for current employee or specified employee (HR only).
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(CheckOutSchema, body);

    const record = await AttendanceService.checkOut(validated, session);
    return NextResponse.json({
      success: true,
      data: record,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
