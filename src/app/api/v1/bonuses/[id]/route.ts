import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { BonusService } from '@/lib/services/bonus.service';
import { UpdateBonusSchema } from '@/lib/validations/bonus';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const bonus = await BonusService.getBonusById(id, session);

    return NextResponse.json({
      success: true,
      data: bonus,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(UpdateBonusSchema, body);

    const updated = await BonusService.updateBonus(id, validated, session);

    return NextResponse.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
