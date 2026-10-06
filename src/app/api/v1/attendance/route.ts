import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { AttendanceService } from '@/lib/services/attendance.service';
import { AttendanceQuerySchema, ManualAttendanceLogSchema } from '@/lib/validations/attendance';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/attendance
 * Query attendance records with filters and RBAC.
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    const queryParams = {
      employeeId: searchParams.get('employeeId') ?? undefined,
      departmentId: searchParams.get('departmentId') ?? undefined,
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    };

    const validated = await validateRequest(AttendanceQuerySchema, queryParams);
    const result = await AttendanceService.queryAttendance(validated, session);

    return NextResponse.json({
      success: true,
      data: result.records,
      meta: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/attendance
 * Manual Attendance Log (HR/Admin only).
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(ManualAttendanceLogSchema, body);

    const record = await AttendanceService.manualLogAttendance(validated, session);
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
