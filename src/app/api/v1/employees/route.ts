import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { EmployeeService } from '@/lib/services/employee.service';
import { CreateEmployeeSchema, EmployeeQuerySchema } from '@/lib/validations/employee';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validatedParams = await validateRequest(EmployeeQuerySchema, queryParams);

    const result = await EmployeeService.listEmployees(validatedParams, session);

    return NextResponse.json({
      success: true,
      data: result.employees,
      meta: {
        page: result.meta.page,
        limit: result.meta.limit,
        total: result.meta.total,
        totalPages: result.meta.totalPages,
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
    const validatedBody = await validateRequest(CreateEmployeeSchema, body);

    const employee = await EmployeeService.createEmployee(validatedBody, session);

    return NextResponse.json(
      {
        success: true,
        data: employee,
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
