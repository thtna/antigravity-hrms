import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { prisma } from '@/lib/db/prisma';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const organizationId = session.organizationId;

    if (!organizationId || organizationId === '__no_org__') {
      return NextResponse.json({
        success: true,
        data: {
          departments: [],
          positions: [],
          worksites: [],
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    const [departments, positions, worksites] = await Promise.all([
      prisma.department.findMany({
        where: { organizationId },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.position.findMany({
        where: { organizationId },
        select: { id: true, code: true, title: true, baseSalaryGrade: true },
        orderBy: { title: 'asc' },
      }),
      prisma.worksite.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true, address: true, radiusMeters: true },
        orderBy: { name: 'asc' },
      }),
    ]);

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
