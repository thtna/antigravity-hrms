import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { ReportService, ReportType, ReportQueryOptions } from '@/lib/services/report.service';
import { handleApiError, ApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

const VALID_REPORT_TYPES: ReportType[] = [
  'attendance',
  'late',
  'early_leave',
  'overtime',
  'leave',
  'kpi',
  'bonus',
  'penalty',
  'payroll',
];

/**
 * GET /api/v1/reports
 * Query enterprise reports with dynamic filters, sorting, and pagination
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    const type = searchParams.get('type') as ReportType;
    if (!type || !VALID_REPORT_TYPES.includes(type)) {
      throw ApiError.badRequest(
        `Loại báo cáo '${type}' không hợp lệ. Các loại hỗ trợ: ${VALID_REPORT_TYPES.join(', ')}`
      );
    }

    const options: ReportQueryOptions = {
      type,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      employeeId: searchParams.get('employeeId') || undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20,
    };

    const result = await ReportService.getReport(options, session);

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
