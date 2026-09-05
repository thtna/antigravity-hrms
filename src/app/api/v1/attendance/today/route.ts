import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { AttendanceService } from '@/lib/services/attendance.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/attendance/today
 * Get today's live attendance status and current shift for logged-in employee.
 */
export async function GET(_req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const status = await AttendanceService.getTodayStatus(session);
    return NextResponse.json({
      success: true,
      data: status,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
