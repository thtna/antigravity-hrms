import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { LeaveService } from '@/lib/services/leave.service';
import {
  CreateLeaveRequestSchema,
  LeaveQuerySchema,
} from '@/lib/validations/leave';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/leaves
 * List leave requests with RBAC scoping and status/type/date filtering.
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(req.url);
    const queryObj = {
      employeeId: searchParams.get('employeeId') || undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      status: searchParams.get('status') || undefined,
      requestType: searchParams.get('requestType') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
    };

    const validatedQuery = await validateRequest(LeaveQuerySchema, queryObj);
    const result = await LeaveService.listLeaveRequests(validatedQuery, session);

    return NextResponse.json({
      success: true,
      data: result.items,
      meta: {
        ...result.meta,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/leaves
 * Employee submits a leave, late arrival, or early departure request.
 * Enforces overlapping prevention and invalid dates check.
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(CreateLeaveRequestSchema, body);

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await LeaveService.createLeaveRequest(
      validated,
      session,
      undefined,
      { ipAddress: clientIp, userAgent }
    );

    return NextResponse.json(
      {
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
