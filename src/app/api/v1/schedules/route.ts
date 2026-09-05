import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { ScheduleService } from '@/lib/services/schedule.service';
import { AssignSingleScheduleSchema, BulkAssignScheduleSchema, ScheduleQuerySchema } from '@/lib/validations/schedule';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/schedules
 * Query schedules with filters.
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
    };

    const validated = await validateRequest(ScheduleQuerySchema, queryParams);
    const schedules = await ScheduleService.querySchedules(validated, session);

    return NextResponse.json({
      success: true,
      data: schedules,
      meta: {
        total: schedules.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/schedules
 * Assign a single schedule or bulk schedules based on request type.
 * Body can include "type": "single" | "bulk"
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));

    if (body.type === 'bulk') {
      const validated = await validateRequest(BulkAssignScheduleSchema, body);
      const result = await ScheduleService.bulkAssignSchedule(validated, session);
      return NextResponse.json(
        {
          success: true,
          data: result,
          meta: { timestamp: new Date().toISOString() },
        },
        { status: 201 }
      );
    } else {
      const validated = await validateRequest(AssignSingleScheduleSchema, body);
      const schedule = await ScheduleService.assignSingleSchedule(validated, session);
      return NextResponse.json(
        {
          success: true,
          data: schedule,
          meta: { timestamp: new Date().toISOString() },
        },
        { status: 201 }
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}
