import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { PayrollService } from '@/lib/services/payroll.service';
import {
  CreatePayrollPeriodSchema,
  PayrollPeriodQuerySchema,
} from '@/lib/validations/payroll';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const url = new URL(req.url);
    const query = {
      status: url.searchParams.get('status') || undefined,
      search: url.searchParams.get('search') || undefined,
      page: url.searchParams.get('page') || undefined,
      limit: url.searchParams.get('limit') || undefined,
    };
    const validated = PayrollPeriodQuerySchema.parse(query);
    const result = await PayrollService.listPeriods(validated, session);

    return NextResponse.json({
      success: true,
      data: result.data,
      meta: {
        timestamp: new Date().toISOString(),
        pagination: result.pagination,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(CreatePayrollPeriodSchema, body);

    const created = await PayrollService.createPeriod(validated, session);

    return NextResponse.json(
      {
        success: true,
        data: created,
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
