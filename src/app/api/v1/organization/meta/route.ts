import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const organizationId = session.organizationId;

    let [departments, positions, worksites] = await Promise.all([
      prisma.department.findMany({
        where: organizationId ? { organizationId } : undefined,
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.position.findMany({
        where: organizationId ? { organizationId } : undefined,
        select: { id: true, code: true, title: true, baseSalaryGrade: true },
        orderBy: { title: 'asc' },
      }),
      prisma.worksite.findMany({
        where: { isActive: true, ...(organizationId ? { organizationId } : {}) },
        select: { id: true, name: true, address: true, radiusMeters: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Self-healing bootstrap: If database has a specific tenant and it is brand new, provision foundational departments/positions
    if (organizationId && departments.length === 0) {
      const defaultDepts = [
        { organizationId, code: 'TECH', name: 'Phòng Công Nghệ & Kỹ Thuật' },
        { organizationId, code: 'HR', name: 'Phòng Nhân Sự' },
        { organizationId, code: 'SALES', name: 'Phòng Kinh Doanh & Tiếp Thị' },
        { organizationId, code: 'FIN', name: 'Phòng Kế Toán & Tài Chính' },
      ];
      await prisma.department.createMany({ data: defaultDepts, skipDuplicates: true });
      departments = await prisma.department.findMany({ where: { organizationId }, select: { id: true, code: true, name: true } });
    }

    if (organizationId && positions.length === 0) {
      const defaultPositions = [
        { organizationId, code: 'DEV_SR', title: 'Senior Software Engineer', baseSalaryGrade: 25000000 },
        { organizationId, code: 'HR_MGR', title: 'Trưởng Phòng Nhân Sự', baseSalaryGrade: 30000000 },
        { organizationId, code: 'SALES_EXEC', title: 'Chuyên Viên Kinh Doanh', baseSalaryGrade: 12000000 },
        { organizationId, code: 'ACC_LEAD', title: 'Kế Toán Trưởng', baseSalaryGrade: 28000000 },
      ];
      await prisma.position.createMany({ data: defaultPositions as any, skipDuplicates: true });
      positions = await prisma.position.findMany({ where: { organizationId }, select: { id: true, code: true, title: true, baseSalaryGrade: true } });
    }

    if (organizationId && worksites.length === 0) {
      const defaultWorksite = {
        organizationId,
        name: 'Trụ Sở Chính — Antigravity Tower',
        address: 'Tầng 18, Tòa nhà Antigravity, Quận 1, TP. Hồ Chí Minh',
        latitude: 10.776889,
        longitude: 106.700806,
        radiusMeters: 100,
        isActive: true,
      };
      await prisma.worksite.create({ data: defaultWorksite as any });
      worksites = await prisma.worksite.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true, address: true, radiusMeters: true } });
    }

    return NextResponse.json({
      success: true,
      data: {
        departments,
        positions: positions.map((p) => ({ ...p, baseSalaryGrade: Number(p.baseSalaryGrade) })),
        worksites,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
