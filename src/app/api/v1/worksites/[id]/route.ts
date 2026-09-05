import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { WorksiteService } from '@/lib/services/worksite.service';
import { UpdateWorksiteSchema } from '@/lib/validations/worksite';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await requireAuth();
    const { id } = await params;

    const worksite = await WorksiteService.getWorksiteById(id);

    return NextResponse.json({
      success: true,
      data: worksite,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const validatedBody = await validateRequest(UpdateWorksiteSchema, body);

    const updated = await WorksiteService.updateWorksite(id, validatedBody, session);

    return NextResponse.json({
      success: true,
      data: updated,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const result = await WorksiteService.deleteWorksite(id, session);

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
