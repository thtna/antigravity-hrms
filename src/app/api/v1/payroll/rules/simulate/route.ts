import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { PayrollRuleService } from '@/lib/services/payroll-rule.service';
import { SimulatePayrollSchema } from '@/lib/validations/payroll-rule';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(SimulatePayrollSchema, body);

    const simulation = await PayrollRuleService.simulatePayroll(validated, session);

    return NextResponse.json({
      success: true,
      data: simulation,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
