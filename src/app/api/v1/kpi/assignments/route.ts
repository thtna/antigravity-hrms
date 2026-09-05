import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { KpiService } from '@/lib/services/kpi.service';
import { AssignKpiSchema, BulkAssignKpiSchema } from '@/lib/validations/kpi';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));

    // If body contains employeeIds, route to bulk assignment
    if (Array.isArray(body.employeeIds)) {
      const validatedBulk = await validateRequest(BulkAssignKpiSchema, body);
      const result = await KpiService.bulkAssignKpi(validatedBulk, session);

      return NextResponse.json(
        {
          success: true,
          data: result,
          meta: { timestamp: new Date().toISOString() },
        },
        { status: 201 }
      );
    }

    // Single assignment
    const validated = await validateRequest(AssignKpiSchema, body);
    const created = await KpiService.assignKpiToEmployee(validated, session);

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
