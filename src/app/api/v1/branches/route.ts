import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { BranchService } from '@/lib/services/branch.service';
import { CreateBranchSchema } from '@/lib/validations/branch';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const branches = await BranchService.listBranches(includeInactive, session);

    return NextResponse.json({
      success: true,
      data: branches,
      meta: {
        total: branches.length,
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
    const validatedBody = await validateRequest(CreateBranchSchema, body);

    const branch = await BranchService.createBranch(validatedBody, session);

    return NextResponse.json(
      {
        success: true,
        data: branch,
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
