import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { DepartmentService } from '@/lib/services/department.service';
import { CreateDepartmentSchema } from '@/lib/validations/department';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const departments = await DepartmentService.listDepartments(includeInactive);

    return NextResponse.json({
      success: true,
      data: departments,
      meta: {
        total: departments.length,
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
    const validatedBody = await validateRequest(CreateDepartmentSchema, body);

    const department = await DepartmentService.createDepartment(validatedBody, session);

    return NextResponse.json(
      {
        success: true,
        data: department,
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
