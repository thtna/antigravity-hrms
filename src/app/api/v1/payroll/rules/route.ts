import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { PayrollRuleService } from '@/lib/services/payroll-rule.service';
import { CreatePayrollRuleSchema } from '@/lib/validations/payroll-rule';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const rules = await PayrollRuleService.listRules(session);

    return NextResponse.json({
      success: true,
      data: rules,
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
    const validated = await validateRequest(CreatePayrollRuleSchema, body);

    const created = await PayrollRuleService.createRule(validated, session);

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
