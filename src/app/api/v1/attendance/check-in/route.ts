import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { AttendanceService } from '@/lib/services/attendance.service';
import { CheckInSchema } from '@/lib/validations/attendance';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * POST /api/v1/attendance/check-in
 * Check-in for current employee or specified employee (HR only).
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(CheckInSchema, body);

    const record = await AttendanceService.checkIn(validated, session);
    return NextResponse.json(
      {
        success: true,
        data: record,
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
