import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockDashboardService = vi.hoisted(() => ({
  getAdminHrDashboard: vi.fn(),
  getManagerDashboard: vi.fn(),
  getEmployeeDashboard: vi.fn(),
}));
const mockPrisma = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
  },
}));

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/services/dashboard.service', () => ({
  DashboardService: mockDashboardService,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: mockPrisma,
}));

import { GET } from '@/app/api/v1/dashboard/route';

describe('Phase 2 — unified dashboard SUPER_ADMIN guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({
      onboardingStep: 9,
      onboardingSkipped: false,
    });
  });

  function makeSession(overrides: Partial<UserSession>): UserSession {
    return {
      userId: 'usr-dashboard',
      email: 'dashboard@antigravity.test',
      fullName: 'Dashboard User',
      roles: ['employee'],
      permissions: [],
      organizationId: 'org-dashboard-001',
      organizationStatus: 'ACTIVE',
      isActive: true,
      ...overrides,
    };
  }

  function makeRequest(path = '/api/v1/dashboard') {
    return new NextRequest(`http://localhost:3000${path}`);
  }

  it('returns /super-admin metadata for SUPER_ADMIN without calling employee dashboard', async () => {
    mockRequireAuth.mockResolvedValue(
      makeSession({
        roles: ['super_admin'],
        organizationId: null,
        employeeId: undefined,
      })
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.currentRole).toBe('super_admin');
    expect(json.data.availableRoles).toEqual(['super_admin']);
    expect(json.data.redirectTo).toBe('/super-admin');
    expect(json.data.sessionUser.organizationId).toBeNull();
    expect(json.data.sessionUser.needsOnboarding).toBe(false);
    expect(json.data.payload).toBeNull();
    expect(mockDashboardService.getEmployeeDashboard).not.toHaveBeenCalled();
    expect(mockDashboardService.getAdminHrDashboard).not.toHaveBeenCalled();
    expect(mockDashboardService.getManagerDashboard).not.toHaveBeenCalled();
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('does not require an employee record or organization membership for SUPER_ADMIN', async () => {
    mockRequireAuth.mockResolvedValue(
      makeSession({
        roles: ['super_admin'],
        organizationId: null,
        employeeId: undefined,
        tenantRole: undefined,
      })
    );

    const res = await GET(makeRequest('/api/v1/dashboard?role=employee'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.redirectTo).toBe('/super-admin');
    expect(mockDashboardService.getEmployeeDashboard).not.toHaveBeenCalled();
    expect(mockPrisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('preserves normal admin dashboard routing', async () => {
    const session = makeSession({ roles: ['admin'], tenantRole: 'OWNER' });
    mockRequireAuth.mockResolvedValue(session);
    mockDashboardService.getAdminHrDashboard.mockResolvedValue({ kind: 'admin' });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.currentRole).toBe('admin');
    expect(json.data.payload).toEqual({ kind: 'admin' });
    expect(mockDashboardService.getAdminHrDashboard).toHaveBeenCalledWith(session);
  });

  it('preserves normal HR dashboard routing', async () => {
    const session = makeSession({ roles: ['hr'], tenantRole: 'HR_MANAGER' });
    mockRequireAuth.mockResolvedValue(session);
    mockDashboardService.getAdminHrDashboard.mockResolvedValue({ kind: 'hr' });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.currentRole).toBe('admin');
    expect(json.data.payload).toEqual({ kind: 'hr' });
    expect(mockDashboardService.getAdminHrDashboard).toHaveBeenCalledWith(session);
  });

  it('preserves normal manager dashboard routing', async () => {
    const session = makeSession({
      roles: ['manager'],
      tenantRole: 'MANAGER',
      employeeId: 'emp-manager-001',
    });
    mockRequireAuth.mockResolvedValue(session);
    mockDashboardService.getManagerDashboard.mockResolvedValue({ kind: 'manager' });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.currentRole).toBe('manager');
    expect(json.data.payload).toEqual({ kind: 'manager' });
    expect(mockDashboardService.getManagerDashboard).toHaveBeenCalledWith(session);
  });

  it('preserves normal employee dashboard routing', async () => {
    const session = makeSession({
      roles: ['employee'],
      tenantRole: 'EMPLOYEE',
      employeeId: 'emp-employee-001',
    });
    mockRequireAuth.mockResolvedValue(session);
    mockDashboardService.getEmployeeDashboard.mockResolvedValue({ kind: 'employee' });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.currentRole).toBe('employee');
    expect(json.data.payload).toEqual({ kind: 'employee' });
    expect(mockDashboardService.getEmployeeDashboard).toHaveBeenCalledWith(session);
  });

  it('still surfaces the employee-record requirement for normal employees', async () => {
    const session = makeSession({
      roles: ['employee'],
      tenantRole: 'EMPLOYEE',
      employeeId: undefined,
    });
    mockRequireAuth.mockResolvedValue(session);
    mockDashboardService.getEmployeeDashboard.mockRejectedValue(
      ApiError.notFound('Không tìm thấy thông tin nhân viên liên kết với tài khoản này.')
    );

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
    expect(mockDashboardService.getEmployeeDashboard).toHaveBeenCalledWith(session);
  });

  it('keeps normal tenant onboarding organization lookup intact', async () => {
    const session = makeSession({
      roles: ['admin'],
      tenantRole: 'OWNER',
      organizationId: 'org-live-onboarding',
      needsOnboarding: false,
    });
    mockRequireAuth.mockResolvedValue(session);
    mockDashboardService.getAdminHrDashboard.mockResolvedValue({ kind: 'admin' });
    mockPrisma.organization.findUnique.mockResolvedValue({
      onboardingStep: 3,
      onboardingSkipped: false,
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-live-onboarding' },
      select: { onboardingStep: true, onboardingSkipped: true },
    });
    expect(json.data.sessionUser.needsOnboarding).toBe(true);
  });
});
