import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/reports/meta
 * Returns filter metadata (departments, employees scoped by user role)
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const isAdminOrHr = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    // 1. Fetch departments
    let departments: Array<{ id: string; code: string; name: string }> = [];
    if (isAdminOrHr) {
      departments = await prisma.department.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      });
    } else if (isManager && session.departmentId) {
      departments = await prisma.department.findMany({
        where: { id: session.departmentId },
        select: { id: true, code: true, name: true },
      });
    }

    // 2. Fetch employees scoped by role
    let employeeWhere: any = {};
    if (isAdminOrHr) {
      // all active or existing employees
      employeeWhere = {};
    } else if (isManager && session.departmentId) {
      employeeWhere = { departmentId: session.departmentId };
    } else {
      // Employee only sees self
      employeeWhere = { id: session.employeeId };
    }

    const rawEmployees = await prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        departmentId: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const employees = rawEmployees.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      fullName: `${e.lastName} ${e.firstName}`.trim(),
      departmentId: e.departmentId,
    }));

    const reportTypes = [
      { id: 'attendance', label: 'Điểm Danh & Công', icon: 'Clock', desc: 'Chi tiết giờ vào/ra, tổng giờ làm' },
      { id: 'late', label: 'Đi Muộn', icon: 'AlertTriangle', desc: 'Danh sách nhân viên đi muộn theo phút' },
      { id: 'early_leave', label: 'Về Sớm', icon: 'LogOut', desc: 'Danh sách nhân viên về sớm trước giờ quy định' },
      { id: 'overtime', label: 'Làm Thêm (OT)', icon: 'Flame', desc: 'Tổng hợp số giờ OT theo hệ số và phê duyệt' },
      { id: 'leave', label: 'Nghỉ Phép', icon: 'Calendar', desc: 'Thống kê đơn xin nghỉ và loại nghỉ' },
      { id: 'kpi', label: 'Đánh Giá KPI', icon: 'Award', desc: 'Bảng điểm hiệu suất, xếp loại nhân viên' },
      { id: 'bonus', label: 'Khen Thưởng', icon: 'Gift', desc: 'Danh sách các khoản thưởng theo quyết định' },
      { id: 'penalty', label: 'Kỷ Luật & Phạt', icon: 'ShieldAlert', desc: 'Các khoản phạt vi phạm nội quy/chấm công' },
      { id: 'payroll', label: 'Bảng Lương Tổng Hợp', icon: 'DollarSign', desc: 'Thu nhập thực nhận, thuế & bảo hiểm' },
    ];

    return NextResponse.json({
      success: true,
      data: {
        departments,
        employees,
        reportTypes,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
