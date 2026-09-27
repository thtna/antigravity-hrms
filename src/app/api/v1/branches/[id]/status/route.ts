import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { BranchService } from '@/lib/services/branch.service';
import { BranchStatusSchema } from '@/lib/validations/branch';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const { isActive } = await validateRequest(BranchStatusSchema, body);

    const updated = await BranchService.toggleBranchStatus(id, isActive, session);

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        isActive: updated.isActive,
        message: isActive ? 'Da kich hoat chi nhanh.' : 'Da ngung hoat dong chi nhanh.',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
