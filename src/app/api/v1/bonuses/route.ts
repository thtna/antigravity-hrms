import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { BonusService } from '@/lib/services/bonus.service';
import {
  CreateBonusSchema,
  BonusQuerySchema,
} from '@/lib/validations/bonus';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(req.url);
    const queryObj = {
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
      employeeId: searchParams.get('employeeId') || undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      period: searchParams.get('period') || undefined,
      category: searchParams.get('category') || undefined,
      status: searchParams.get('status') || undefined,
    };

    const validatedQuery = await validateRequest(BonusQuerySchema, queryObj);
    const result = await BonusService.listBonuses(validatedQuery, session);

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

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(CreateBonusSchema, body);

    const created = await BonusService.createBonus(validated, session);

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
