import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { DashboardService } from '@/lib/services/dashboard.service';
import { handleApiError, ApiError } from '@/lib/errors';
import { ApiResponse, RoleCode } from '@/types';
import { prisma } from '@/lib/db/prisma';
import { SUPER_ADMIN_LANDING_PATH } from '@/lib/auth/super-admin-landing';
import { isSuperAdmin } from '@/lib/auth/roles';

/**
 * GET /api/v1/dashboard
 * Unified role-aware dashboard entrypoint.
 * Automatically resolves the appropriate dashboard payload based on user roles,
 * or allows switching via `?role=admin|manager|employee` if user possesses the required privileges.
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();

    if (isSuperAdmin(session)) {
      return NextResponse.json({
        success: true,
        data: {
          currentRole: 'super_admin',
          availableRoles: ['super_admin'],
          redirectTo: SUPER_ADMIN_LANDING_PATH,
          sessionUser: {
            fullName: session.fullName,
            email: session.email,
            employeeId: session.employeeId,
            roles: session.roles,
            tenantRole: session.tenantRole,
            organizationId: session.organizationId,
            organizationName: session.organizationName,
            onboardingStep: session.onboardingStep,
            needsOnboarding: false,
          },
          payload: null,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { searchParams } = new URL(req.url);
    const requestedRole = searchParams.get('role')?.toLowerCase();

    const isAdminOrHr = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    const availableRoles: RoleCode[] = ['employee'];
    if (isManager || isAdminOrHr) availableRoles.push('manager');
    if (isAdminOrHr) availableRoles.push('admin');

    let effectiveRole: 'admin' | 'manager' | 'employee';

    if (requestedRole === 'admin') {
      if (!isAdminOrHr) {
        throw ApiError.forbidden('Bạn không có quyền truy cập Dashboard Quản Trị (Admin/HR).');
      }
      effectiveRole = 'admin';
    } else if (requestedRole === 'manager') {
      if (!isManager && !isAdminOrHr) {
        throw ApiError.forbidden('Bạn không có quyền truy cập Dashboard Quản Lý (Manager).');
      }
      effectiveRole = 'manager';
    } else if (requestedRole === 'employee') {
      effectiveRole = 'employee';
    } else {
      // Auto-detect highest priority role
      if (isAdminOrHr) {
        effectiveRole = 'admin';
      } else if (isManager) {
        effectiveRole = 'manager';
      } else {
        effectiveRole = 'employee';
      }
    }

    let data;
    if (effectiveRole === 'admin') {
      data = await DashboardService.getAdminHrDashboard(session);
    } else if (effectiveRole === 'manager') {
      data = await DashboardService.getManagerDashboard(session);
    } else {
      data = await DashboardService.getEmployeeDashboard(session);
    }

    // Inspect live organization onboarding status dynamically from database
    // Prevents stale JWT cookie from falsely displaying "chưa hoàn thành thiết lập"
    let liveOnboardingStep = session.onboardingStep;
    let liveNeedsOnboarding = Boolean(session.needsOnboarding);

    if (session.organizationId && session.organizationId !== '__no_org__') {
      const org = await prisma.organization.findUnique({
        where: { id: session.organizationId },
        select: { onboardingStep: true, onboardingSkipped: true },
      });
      if (org) {
        liveOnboardingStep = org.onboardingStep;
        const isOwner = session.tenantRole === 'OWNER';
        liveNeedsOnboarding = isOwner && org.onboardingStep < 9 && !org.onboardingSkipped;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        currentRole: effectiveRole,
        availableRoles,
        sessionUser: {
          fullName: session.fullName,
          email: session.email,
          employeeId: session.employeeId,
          roles: session.roles,
          tenantRole: session.tenantRole,
          organizationId: session.organizationId,
          organizationName: session.organizationName,
          onboardingStep: liveOnboardingStep,
          needsOnboarding: liveNeedsOnboarding,
        },
        payload: data,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
