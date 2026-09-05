import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { GpsAttendanceService } from '@/lib/services/gps-attendance.service';
import { GpsVerifySchema } from '@/lib/validations/gps-attendance';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();

    const body = await request.json().catch(() => ({}));
    const validatedBody = await validateRequest(GpsVerifySchema, body);

    const result = await GpsAttendanceService.verifyGpsProximity(validatedBody, session);

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
