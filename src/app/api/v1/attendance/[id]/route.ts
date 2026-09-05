import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { AttendanceService } from '@/lib/services/attendance.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/attendance/[id]
 * Get attendance detail by ID with RBAC check.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const record = await AttendanceService.getAttendanceById(id, session);
    return NextResponse.json({
      success: true,
      data: record,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
