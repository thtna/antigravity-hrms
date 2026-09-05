import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { KpiService } from '@/lib/services/kpi.service';
import { ScorecardQuerySchema } from '@/lib/validations/kpi';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(req.url);
    const queryObj = {
      employeeId: searchParams.get('employeeId') || undefined,
      period: searchParams.get('period') || undefined,
    };

    const validatedQuery = await validateRequest(ScorecardQuerySchema, queryObj);
    const result = await KpiService.getEmployeeScorecard(
      validatedQuery.employeeId,
      validatedQuery.period,
      session
    );

    return NextResponse.json({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
