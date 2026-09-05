import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { PayrollWorkflowService } from '@/lib/services/payroll-workflow.service';
import { ProcessAdjustmentSchema } from '@/lib/validations/payroll-workflow';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(ProcessAdjustmentSchema, body);

    const updated = await PayrollWorkflowService.processAdjustmentRequest(id, validated, session);

    return NextResponse.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
