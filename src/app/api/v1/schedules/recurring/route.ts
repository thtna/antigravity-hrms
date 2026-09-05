import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { ScheduleService } from '@/lib/services/schedule.service';
import { AssignRecurringPatternSchema } from '@/lib/validations/schedule';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/schedules/recurring?employeeId=...
 * Get recurring patterns for an employee.
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');

    if (!employeeId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'employeeId là bắt buộc.',
          },
        },
        { status: 400 }
      );
    }

    const patterns = await ScheduleService.getRecurringPatterns(employeeId, session);
    return NextResponse.json({
      success: true,
      data: patterns,
      meta: {
        total: patterns.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/schedules/recurring
 * Assign a recurring weekly pattern.
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(AssignRecurringPatternSchema, body);

    const records = await ScheduleService.assignRecurringPattern(validated, session);
    return NextResponse.json(
      {
        success: true,
        data: records,
        meta: {
          count: records.length,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
