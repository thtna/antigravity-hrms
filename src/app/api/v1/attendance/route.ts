import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import {
  AttendanceQueryTiming,
  AttendanceService,
} from '@/lib/services/attendance.service';
import { AttendanceQuerySchema, ManualAttendanceLogSchema } from '@/lib/validations/attendance';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

function attachAttendanceServerTiming<T>(
  response: NextResponse<T>,
  timings: {
    authMs: number;
    validationMs: number;
    serviceMs: number;
    totalMs: number;
    query: AttendanceQueryTiming;
  }
): NextResponse<T> {
  if (process.env.VERCEL_ENV !== 'production') {
    response.headers.set(
      'Server-Timing',
      [
        `auth;dur=${timings.authMs.toFixed(1)}`,
        `validation;dur=${timings.validationMs.toFixed(1)}`,
        `attendance_count;dur=${(timings.query.countMs ?? 0).toFixed(1)}`,
        `attendance_find_many;dur=${(timings.query.findManyMs ?? 0).toFixed(1)}`,
        `db_parallel;dur=${(timings.query.dbParallelMs ?? 0).toFixed(1)}`,
        `service;dur=${timings.serviceMs.toFixed(1)}`,
        `total;dur=${timings.totalMs.toFixed(1)}`,
      ].join(', ')
    );
  }
  return response;
}

/**
 * GET /api/v1/attendance
 * Query attendance records with filters and RBAC.
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  const routeStart = performance.now();
  let authMs = 0;
  let validationMs = 0;
  let serviceMs = 0;
  const queryTiming: AttendanceQueryTiming = {};

  try {
    const authStart = performance.now();
    const session = await requireAuth();
    authMs = performance.now() - authStart;

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

    const validationStart = performance.now();
    const validated = await validateRequest(AttendanceQuerySchema, queryParams);
    validationMs = performance.now() - validationStart;

    const serviceStart = performance.now();
    const result = await AttendanceService.queryAttendance(validated, session, queryTiming);
    serviceMs = performance.now() - serviceStart;

    return attachAttendanceServerTiming(
      NextResponse.json<ApiResponse<any>>({
        success: true,
        data: result.records,
        meta: {
          page: result.pagination.page,
          limit: result.pagination.limit,
          total: result.pagination.total,
          totalPages: result.pagination.totalPages,
          timestamp: new Date().toISOString(),
        },
      }),
      {
        authMs,
        validationMs,
        serviceMs,
        totalMs: performance.now() - routeStart,
        query: queryTiming,
      }
    );
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
