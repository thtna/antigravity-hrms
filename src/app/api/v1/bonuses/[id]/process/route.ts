import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { BonusService } from '@/lib/services/bonus.service';
import { ProcessBonusSchema } from '@/lib/validations/bonus';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(ProcessBonusSchema, body);

    const processed = await BonusService.processBonus(id, validated, session);

    return NextResponse.json({
      success: true,
      data: processed,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
