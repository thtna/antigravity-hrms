import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { PayrollWorkflowService } from '@/lib/services/payroll-workflow.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const { periodId } = await params;

    const history = await PayrollWorkflowService.getApprovalHistory(periodId, session);

    return NextResponse.json({
      success: true,
      data: history,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
