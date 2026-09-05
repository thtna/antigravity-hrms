import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { PositionService } from '@/lib/services/position.service';
import { CreatePositionSchema } from '@/lib/validations/position';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const positions = await PositionService.listPositions(includeInactive);

    return NextResponse.json({
      success: true,
      data: positions,
      meta: {
        total: positions.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();

    const body = await request.json().catch(() => ({}));
    const validatedBody = await validateRequest(CreatePositionSchema, body);

    const position = await PositionService.createPosition(validatedBody, session);

    return NextResponse.json(
      {
        success: true,
        data: position,
        meta: {
          timestamp: new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
