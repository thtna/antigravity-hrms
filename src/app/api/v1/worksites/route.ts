import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { WorksiteService } from '@/lib/services/worksite.service';
import { CreateWorksiteSchema, WorksiteQuerySchema } from '@/lib/validations/worksite';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const query = {
      search: searchParams.get('search') || undefined,
      isActive: (searchParams.get('isActive') as any) || 'ALL',
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 50,
    };

    const validatedQuery = await validateRequest(WorksiteQuerySchema, query);
    const result = await WorksiteService.getWorksites(validatedQuery, session);

    return NextResponse.json({
      success: true,
      data: result.items,
      meta: {
        pagination: result.pagination,
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
    const validatedBody = await validateRequest(CreateWorksiteSchema, body);

    const worksite = await WorksiteService.createWorksite(validatedBody, session);

    return NextResponse.json(
      {
        success: true,
        data: worksite,
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
