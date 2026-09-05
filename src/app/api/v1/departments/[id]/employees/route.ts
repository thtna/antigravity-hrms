import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { DepartmentService } from '@/lib/services/department.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await requireAuth();
    const { id } = await params;

    const department = await DepartmentService.getDepartmentById(id);

    return NextResponse.json({
      success: true,
      data: {
        departmentId: department.id,
        departmentCode: department.code,
        departmentName: department.name,
        manager: department.manager,
        employeeCount: department.employeeCount,
        employees: department.employees,
      },
      meta: {
        total: department.employeeCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
