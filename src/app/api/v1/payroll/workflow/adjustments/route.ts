import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { PayrollWorkflowService } from '@/lib/services/payroll-workflow.service';
import { CreateAdjustmentSchema } from '@/lib/validations/payroll-workflow';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const url = new URL(req.url);
    const periodId = url.searchParams.get('periodId');

    if (!periodId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Yêu cầu cung cấp periodId.' },
        },
        { status: 400 }
      );
    }

    const adjustments = await PayrollWorkflowService.listAdjustments(periodId, session);

    return NextResponse.json({
      success: true,
      data: adjustments,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(CreateAdjustmentSchema, body);

    const created = await PayrollWorkflowService.createAdjustmentRequest(validated, session);

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
