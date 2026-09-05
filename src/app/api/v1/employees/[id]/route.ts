import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { EmployeeService } from '@/lib/services/employee.service';
import { UpdateEmployeeSchema } from '@/lib/validations/employee';
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

    const employee = await EmployeeService.getEmployeeById(id, session);

    return NextResponse.json({
      success: true,
      data: employee,
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
    const validatedBody = await validateRequest(UpdateEmployeeSchema, body);

    const updated = await EmployeeService.updateEmployee(id, validatedBody, session);

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

    const result = await EmployeeService.softDeleteEmployee(id, session);

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

