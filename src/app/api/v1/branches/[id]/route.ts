import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { BranchService } from '@/lib/services/branch.service';
import { UpdateBranchSchema } from '@/lib/validations/branch';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const branch = await BranchService.getBranchById(id, session);

    return NextResponse.json({
      success: true,
      data: branch,
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
    const validatedBody = await validateRequest(UpdateBranchSchema, body);

    const updated = await BranchService.updateBranch(id, validatedBody, session);

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

    const result = await BranchService.deleteBranch(id, session);

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
