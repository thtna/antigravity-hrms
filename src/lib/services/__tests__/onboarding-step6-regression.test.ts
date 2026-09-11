import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserSession } from '@/types';
import { ApiError } from '@/lib/errors';

const { dbState, mockPrisma, resetDbState } = vi.hoisted(() => {
  interface DbState {
    organizations: Map<string, any>;
    users: Map<string, any>;
    employees: Map<string, any>;
    departments: Map<string, any>;
    positions: Map<string, any>;
    worksites: Map<string, any>;
    roles: Map<string, any>;
    userRoles: Array<any>;
    organizationMembers: Array<any>;
    auditLogs: Array<any>;
  }

  function createInitialState(): DbState {
    const state: DbState = {
      organizations: new Map(),
      users: new Map(),
      employees: new Map(),
      departments: new Map(),
      positions: new Map(),
      worksites: new Map(),
      roles: new Map(),
      userRoles: [],
      organizationMembers: [],
      auditLogs: [],
    };

    // Seed system roles
    state.roles.set('employee', { id: 'role-emp-01', code: 'employee', name: 'Nhân viên' });
    state.roles.set('admin', { id: 'role-admin-01', code: 'admin', name: 'Quản trị viên' });

    // Seed tenants
    state.organizations.set('org-tenant-a', {
      id: 'org-tenant-a',
      name: 'Tenant A Corp',
      status: 'ACTIVE',
      onboardingStep: 5,
      onboardingSkipped: false,
      deletedAt: null,
    });

    state.organizations.set('org-tenant-b', {
      id: 'org-tenant-b',
      name: 'Tenant B Corp',
      status: 'ACTIVE',
      onboardingStep: 5,
      onboardingSkipped: false,
      deletedAt: null,
    });

    // Seed Tenant A department & position
    state.departments.set('dept-a-01', {
      id: 'dept-a-01',
      organizationId: 'org-tenant-a',
      code: 'BGD-A',
      name: 'Ban Giám Đốc A',
      deletedAt: null,
    });

    state.positions.set('pos-a-01', {
      id: 'pos-a-01',
      organizationId: 'org-tenant-a',
      code: 'CEO-A',
      title: 'Giám Đốc A',
      deletedAt: null,
    });

    // Seed Tenant B department & position (for cross-tenant rejection tests)
    state.departments.set('dept-b-01', {
      id: 'dept-b-01',
      organizationId: 'org-tenant-b',
      code: 'BGD-B',
      name: 'Ban Giám Đốc B',
      deletedAt: null,
    });

    state.positions.set('pos-b-01', {
      id: 'pos-b-01',
      organizationId: 'org-tenant-b',
      code: 'CEO-B',
      title: 'Giám Đốc B',
      deletedAt: null,
    });

    return state;
  }

  let state = createInitialState();

  const p: any = {
    organization: {
      findUnique: vi.fn(async ({ where }: any) => state.organizations.get(where.id) || null),
      findFirst: vi.fn(async ({ where }: any) => state.organizations.get(where?.id) || null),
      update: vi.fn(async ({ where, data }: any) => {
        const org = state.organizations.get(where.id);
        if (!org) throw new Error('Org not found');
        const updated = { ...org, ...data };
        state.organizations.set(where.id, updated);
        return updated;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const [id, org] of state.organizations.entries()) {
          let match = true;
          if (where?.id && id !== where.id) match = false;
          if (where?.onboardingStep?.lt !== undefined && org.onboardingStep >= where.onboardingStep.lt) match = false;
          if (match) {
            state.organizations.set(id, { ...org, ...data });
            count++;
          }
        }
        return { count };
      }),
      count: vi.fn(async () => state.organizations.size),
    },
    branch: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => data),
      count: vi.fn(async () => 0),
    },
    workShift: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => data),
      count: vi.fn(async () => 0),
    },
    attendance: {
      count: vi.fn(async () => 0),
    },
    leaveRequest: {
      count: vi.fn(async () => 0),
    },
    payroll: {
      count: vi.fn(async () => 0),
    },
    kpi: {
      count: vi.fn(async () => 0),
    },
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.email) {
          for (const u of state.users.values()) {
            if (u.email.toLowerCase() === where.email.toLowerCase()) {
              const emp = Array.from(state.employees.values()).find((e) => e.userId === u.id);
              return { ...u, employee: emp || null };
            }
          }
        }
        if (where.id) {
          const u = state.users.get(where.id);
          if (u) {
            const emp = Array.from(state.employees.values()).find((e) => e.userId === u.id);
            return { ...u, employee: emp || null };
          }
        }
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = data.id || `usr-${Date.now()}-${Math.random()}`;
        const u = { id, ...data };
        state.users.set(id, u);
        return u;
      }),
      count: vi.fn(async () => state.users.size),
    },
    role: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.code) {
          for (const r of state.roles.values()) {
            if (r.code === where.code) return r;
          }
        }
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = `role-${Date.now()}`;
        const r = { id, ...data };
        state.roles.set(data.code, r);
        return r;
      }),
    },
    department: {
      findFirst: vi.fn(async ({ where }: any) => {
        for (const d of state.departments.values()) {
          if (where.id && d.id !== where.id) continue;
          if (where.organizationId && d.organizationId !== where.organizationId) continue;
          if (where.deletedAt === null && d.deletedAt !== null) continue;
          return d;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = `dept-${Date.now()}`;
        const d = { id, ...data };
        state.departments.set(id, d);
        return d;
      }),
      count: vi.fn(async () => state.departments.size),
    },
    position: {
      findFirst: vi.fn(async ({ where }: any) => {
        for (const pos of state.positions.values()) {
          if (where.id && pos.id !== where.id) continue;
          if (where.organizationId && pos.organizationId !== where.organizationId) continue;
          if (where.deletedAt === null && pos.deletedAt !== null) continue;
          return pos;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = `pos-${Date.now()}`;
        const pos = { id, ...data };
        state.positions.set(id, pos);
        return pos;
      }),
      count: vi.fn(async () => state.positions.size),
    },
    worksite: {
      findFirst: vi.fn(async ({ where }: any) => {
        for (const w of state.worksites.values()) {
          if (where.id && w.id !== where.id) continue;
          if (where.organizationId && w.organizationId !== where.organizationId) continue;
          return w;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = `ws-${Date.now()}`;
        const w = { id, ...data };
        state.worksites.set(id, w);
        return w;
      }),
      count: vi.fn(async () => state.worksites.size),
    },
    employee: {
      findFirst: vi.fn(async ({ where }: any) => {
        for (const e of state.employees.values()) {
          if (where.deletedAt === null && e.deletedAt != null) continue;
          if (where.organizationId && e.organizationId !== where.organizationId) continue;
          if (where.employeeCode && e.employeeCode.toUpperCase() === where.employeeCode.toUpperCase()) {
            const u = state.users.get(e.userId);
            return { ...e, user: u };
          }
          if (where.identityCard && e.identityCard === where.identityCard) {
            const u = state.users.get(e.userId);
            return { ...e, user: u };
          }
        }
        return null;
      }),
      create: vi.fn(async ({ data, include }: any) => {
        const id = data.id || `emp-${Date.now()}-${Math.random()}`;
        const emp = { id, ...data };
        state.employees.set(id, emp);
        const u = state.users.get(emp.userId);
        const dept = state.departments.get(emp.departmentId);
        const pos = state.positions.get(emp.positionId);
        return {
          ...emp,
          user: u || { id: emp.userId, email: 'unknown@corp.vn', isActive: true },
          department: dept || null,
          position: pos || null,
          worksite: null,
        };
      }),
      count: vi.fn(async () => state.employees.size),
    },
    organizationMember: {
      create: vi.fn(async ({ data }: any) => {
        state.organizationMembers.push(data);
        return { id: `om-${Date.now()}`, ...data };
      }),
      upsert: vi.fn(async ({ create }: any) => {
        state.organizationMembers.push(create);
        return { id: `om-${Date.now()}`, ...create };
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        state.auditLogs.push(data);
        return { id: `log-${Date.now()}`, ...data };
      }),
    },
    $transaction: vi.fn(async (cb: any, options: any) => {
      // Create snapshot for rollback simulation
      const snapshot = {
        organizations: new Map(state.organizations),
        users: new Map(state.users),
        employees: new Map(state.employees),
        departments: new Map(state.departments),
        positions: new Map(state.positions),
        worksites: new Map(state.worksites),
        userRoles: [...state.userRoles],
        organizationMembers: [...state.organizationMembers],
        auditLogs: [...state.auditLogs],
      };

      try {
        const result = await cb(p);
        return result;
      } catch (err) {
        // Rollback state on error
        state.organizations.clear();
        snapshot.organizations.forEach((v, k) => state.organizations.set(k, v));
        state.users.clear();
        snapshot.users.forEach((v, k) => state.users.set(k, v));
        state.employees.clear();
        snapshot.employees.forEach((v, k) => state.employees.set(k, v));
        state.departments.clear();
        snapshot.departments.forEach((v, k) => state.departments.set(k, v));
        state.positions.clear();
        snapshot.positions.forEach((v, k) => state.positions.set(k, v));
        state.worksites.clear();
        snapshot.worksites.forEach((v, k) => state.worksites.set(k, v));
        state.userRoles.length = 0;
        state.userRoles.push(...snapshot.userRoles);
        state.organizationMembers.length = 0;
        state.organizationMembers.push(...snapshot.organizationMembers);
        state.auditLogs.length = 0;
        state.auditLogs.push(...snapshot.auditLogs);
        throw err;
      }
    }),
  };

  const resetDbState = () => {
    state.organizations.clear();
    state.users.clear();
    state.employees.clear();
    state.departments.clear();
    state.positions.clear();
    state.worksites.clear();
    state.roles.clear();
    state.userRoles.length = 0;
    state.organizationMembers.length = 0;
    state.auditLogs.length = 0;

    const fresh = createInitialState();
    fresh.organizations.forEach((v, k) => state.organizations.set(k, v));
    fresh.departments.forEach((v, k) => state.departments.set(k, v));
    fresh.positions.forEach((v, k) => state.positions.set(k, v));
    fresh.roles.forEach((v, k) => state.roles.set(k, v));
  };

  return { dbState: state, mockPrisma: p, resetDbState };
});

vi.mock('@/lib/db/prisma', () => ({
  prisma: mockPrisma,
}));

import { OnboardingService } from '../onboarding.service';
import { EmployeeService } from '../employee.service';

describe('STAGING ONBOARDING STEP 6 REGRESSION & ATOMICITY TEST SUITE', () => {
  const activeOwnerSession: UserSession = {
    userId: 'usr-owner-a',
    email: 'owner@tenanta.vn',
    fullName: 'Owner Tenant A',
    roles: ['admin'],
    tenantRole: 'OWNER',
    organizationId: 'org-tenant-a',
    organizationName: 'Tenant A Corp',
    isActive: true,
    permissions: ['*'],
  };

  const activeOwnerSessionWithoutAdminRole: UserSession = {
    userId: 'usr-owner-noadmin',
    email: 'ownernoadmin@tenanta.vn',
    fullName: 'Owner Without Admin Role',
    roles: ['employee'], // No admin role in session.roles
    tenantRole: 'OWNER',
    organizationId: 'org-tenant-a',
    organizationName: 'Tenant A Corp',
    isActive: true,
    permissions: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetDbState();
  });

  // --------------------------------------------------------------------------
  // 1. Success Flow & Tenant Isolation
  // --------------------------------------------------------------------------
  it('1. Owner ACTIVE saves Step 6 successfully with correct organizationId', async () => {
    const payload = {
      firstName: 'Văn A',
      lastName: 'Nguyễn',
      employeeCode: 'EMP-001',
      email: 'employee01@tenanta.vn',
      phoneNumber: '0901234567',
      departmentId: 'dept-a-01',
      positionId: 'pos-a-01',
      contractSalary: 25000000,
    };

    const result = await OnboardingService.saveStep(activeOwnerSession, 6, payload);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.completedStep).toBe(6);
    expect(result.nextStep).toBe(7);
    expect(result.createdData.employeeCode).toBe('EMP-001');
    expect(result.createdData.organizationId).toBe('org-tenant-a');
    expect(result.createdData.fullName).toBe('Nguyễn Văn A');

    // Verify organization onboardingStep advanced to 7
    const org = dbState.organizations.get('org-tenant-a');
    expect(org.onboardingStep).toBe(7);

    // Verify created employee in DB
    const savedEmp = Array.from(dbState.employees.values()).find((e) => e.employeeCode === 'EMP-001');
    expect(savedEmp).toBeDefined();
    expect(savedEmp?.organizationId).toBe('org-tenant-a');

    // Verify user account created
    const savedUser = dbState.users.get(savedEmp?.userId);
    expect(savedUser).toBeDefined();
    expect(savedUser?.email).toBe('employee01@tenanta.vn');

    // Verify organizationMember created
    const member = dbState.organizationMembers.find((m) => m.userId === savedUser?.id);
    expect(member).toBeDefined();
    expect(member?.organizationId).toBe('org-tenant-a');
    expect(member?.role).toBe('EMPLOYEE');

    // Verify audit log has organizationId
    const audit = dbState.auditLogs.find((l) => l.action === 'CREATE_EMPLOYEE');
    expect(audit).toBeDefined();
    expect(audit?.organizationId).toBe('org-tenant-a');
  });

  it('1.1 Missing department/position fails without fallback rows or employee creation', async () => {
    dbState.departments.delete('dept-a-01');
    dbState.positions.delete('pos-a-01');

    const initialDepartmentCount = dbState.departments.size;
    const initialPositionCount = dbState.positions.size;
    const initialEmployeeCount = dbState.employees.size;
    const initialUserCount = dbState.users.size;
    const org = dbState.organizations.get('org-tenant-a');
    org.onboardingStep = 6;

    await expect(
      OnboardingService.saveStep(activeOwnerSession, 6, {
        firstName: 'Văn A',
        lastName: 'Nguyễn',
        employeeCode: 'EMP-MISSING-FK',
        email: 'missing-fk@tenanta.vn',
        phoneNumber: '0901234567',
        contractSalary: 25000000,
      })
    ).rejects.toThrow('Vui lòng chọn phòng ban và chức vụ đã được cấu hình');

    expect(mockPrisma.department.create).not.toHaveBeenCalled();
    expect(mockPrisma.position.create).not.toHaveBeenCalled();
    expect(dbState.departments.size).toBe(initialDepartmentCount);
    expect(dbState.positions.size).toBe(initialPositionCount);
    expect(dbState.employees.size).toBe(initialEmployeeCount);
    expect(dbState.users.size).toBe(initialUserCount);
    expect(Array.from(dbState.departments.values()).some((d) => d.code === 'BGD')).toBe(false);
    expect(Array.from(dbState.positions.values()).some((p) => p.code === 'CEO')).toBe(false);
    expect(dbState.organizations.get('org-tenant-a').onboardingStep).toBe(6);
  });

  // --------------------------------------------------------------------------
  // 2. Cross-Tenant FK Injection Prevention
  // --------------------------------------------------------------------------
  it('2. Invalid cross-tenant department/position rejected with 400 Bad Request', async () => {
    const invalidDeptPayload = {
      firstName: 'Văn B',
      lastName: 'Trần',
      employeeCode: 'EMP-002',
      email: 'employee02@tenanta.vn',
      phoneNumber: '0901234568',
      departmentId: 'dept-b-01', // Belongs to Tenant B!
      positionId: 'pos-a-01',
      contractSalary: 20000000,
    };

    await expect(
      OnboardingService.saveStep(activeOwnerSession, 6, invalidDeptPayload)
    ).rejects.toThrow('Phòng ban không tồn tại trong tổ chức của bạn.');

    const invalidPosPayload = {
      firstName: 'Văn C',
      lastName: 'Lê',
      employeeCode: 'EMP-003',
      email: 'employee03@tenanta.vn',
      phoneNumber: '0901234569',
      departmentId: 'dept-a-01',
      positionId: 'pos-b-01', // Belongs to Tenant B!
      contractSalary: 20000000,
    };

    await expect(
      OnboardingService.saveStep(activeOwnerSession, 6, invalidPosPayload)
    ).rejects.toThrow('Chức vụ không tồn tại trong tổ chức của bạn.');
  });

  // --------------------------------------------------------------------------
  // 3. Precise Idempotent Retry vs Collision Rejection
  // --------------------------------------------------------------------------
  it('3.1 Exact idempotent retry does NOT create duplicate employee and advances onboardingStep', async () => {
    const payload = {
      firstName: 'Văn A',
      lastName: 'Nguyễn',
      employeeCode: 'EMP-001',
      email: 'employee01@tenanta.vn',
      phoneNumber: '0901234567',
      departmentId: 'dept-a-01',
      positionId: 'pos-a-01',
      contractSalary: 25000000,
    };

    // First attempt
    const firstResult = await OnboardingService.saveStep(activeOwnerSession, 6, payload);
    expect(firstResult.success).toBe(true);
    expect(firstResult.createdData.id).toBeDefined();
    const initialEmployeeCount = dbState.employees.size;
    const initialUserCount = dbState.users.size;

    // Retry with EXACT SAME payload
    const retryResult = await OnboardingService.saveStep(activeOwnerSession, 6, payload);

    expect(retryResult).toBeDefined();
    expect(retryResult.success).toBe(true);
    expect(retryResult.createdData.id).toBe(firstResult.createdData.id);
    expect(dbState.employees.size).toBe(initialEmployeeCount);
    expect(dbState.users.size).toBe(initialUserCount);

    // Organization onboardingStep must be >= 7
    const org = dbState.organizations.get('org-tenant-a');
    expect(org.onboardingStep).toBe(7);
  });

  it('3.2 Collision with mismatched identity rejects with 409 and does NOT advance onboardingStep', async () => {
    // Seed existing employee in Tenant A
    const existingUser = {
      id: 'usr-existing-01',
      email: 'original@tenanta.vn',
      isActive: true,
    };
    dbState.users.set(existingUser.id, existingUser);

    const existingEmp = {
      id: 'emp-existing-01',
      userId: existingUser.id,
      organizationId: 'org-tenant-a',
      employeeCode: 'EMP-DUPE',
      firstName: 'Thành',
      lastName: 'Phạm',
      contractSalary: 15000000,
      deletedAt: null,
    };
    dbState.employees.set(existingEmp.id, existingEmp);

    // Set org onboardingStep to 6
    const org = dbState.organizations.get('org-tenant-a');
    org.onboardingStep = 6;

    // Payload uses SAME code 'EMP-DUPE' but DIFFERENT email & name (collision, NOT an exact retry!)
    const collidingPayload = {
      firstName: 'Khác Biệt',
      lastName: 'Hoàn Toàn',
      employeeCode: 'EMP-DUPE',
      email: 'completely_different@tenanta.vn',
      phoneNumber: '0909999999',
      departmentId: 'dept-a-01',
      positionId: 'pos-a-01',
      contractSalary: 30000000,
    };

    await expect(
      OnboardingService.saveStep(activeOwnerSession, 6, collidingPayload)
    ).rejects.toThrow('Mã nhân viên [EMP-DUPE] đã tồn tại trong tổ chức.');

    // MUST NOT advance onboardingStep on collision!
    expect(dbState.organizations.get('org-tenant-a').onboardingStep).toBe(6);
  });

  // --------------------------------------------------------------------------
  // 4. Transaction Rollback & Zero Partial Records
  // --------------------------------------------------------------------------
  it('4. Transaction rolls back completely if organization update or write fails: no orphan User, no partial records, step stays 6', async () => {
    const org = dbState.organizations.get('org-tenant-a');
    org.onboardingStep = 6;

    const initialUserCount = dbState.users.size;
    const initialEmpCount = dbState.employees.size;
    const initialMemberCount = dbState.organizationMembers.length;
    const initialAuditCount = dbState.auditLogs.length;

    // Simulate database failure during organization step update inside the transaction
    const originalOrgUpdate = mockPrisma.organization.update;
    mockPrisma.organization.update = vi.fn().mockRejectedValue(new Error('Simulated DB connection failure on step update'));

    const payload = {
      firstName: 'Hùng',
      lastName: 'Đặng',
      employeeCode: 'EMP-FAIL',
      email: 'fail@tenanta.vn',
      phoneNumber: '0901234599',
      departmentId: 'dept-a-01',
      positionId: 'pos-a-01',
      contractSalary: 18000000,
    };

    try {
      await expect(
        OnboardingService.saveStep(activeOwnerSession, 6, payload)
      ).rejects.toThrow('Simulated DB connection failure on step update');

      // PROVE ROLLBACK:
      // 1. onboardingStep remains 6
      expect(dbState.organizations.get('org-tenant-a').onboardingStep).toBe(6);

      // 2. No orphan User was committed
      expect(dbState.users.size).toBe(initialUserCount);
      expect(Array.from(dbState.users.values()).find((u) => u.email === 'fail@tenanta.vn')).toBeUndefined();

      // 3. No partial Employee was committed
      expect(dbState.employees.size).toBe(initialEmpCount);
      expect(Array.from(dbState.employees.values()).find((e) => e.employeeCode === 'EMP-FAIL')).toBeUndefined();

      // 4. No partial OrganizationMember was committed
      expect(dbState.organizationMembers.length).toBe(initialMemberCount);

      // 5. No AuditLog was committed
      expect(dbState.auditLogs.length).toBe(initialAuditCount);
    } finally {
      // Restore mock
      mockPrisma.organization.update = originalOrgUpdate;
    }
  });

  // --------------------------------------------------------------------------
  // 5. Scoped OWNER Onboarding Authorization (Requirement 5)
  // --------------------------------------------------------------------------
  it('5.1 Owner without admin role in session.roles can save Step 6 during onboarding', async () => {
    const payload = {
      firstName: 'Thảo',
      lastName: 'Vũ',
      employeeCode: 'EMP-OWNER-OK',
      email: 'owner-ok@tenanta.vn',
      phoneNumber: '0908888888',
      departmentId: 'dept-a-01',
      positionId: 'pos-a-01',
      contractSalary: 22000000,
    };

    const result = await OnboardingService.saveStep(activeOwnerSessionWithoutAdminRole, 6, payload);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.createdData.employeeCode).toBe('EMP-OWNER-OK');
  });

  it('5.2 Owner cannot call EmployeeService.createEmployee directly without allowOwnerOnboarding (preserves global RBAC)', async () => {
    const payload = {
      firstName: 'Trực Tiếp',
      lastName: 'Gọi',
      employeeCode: 'EMP-DIRECT',
      email: 'direct@tenanta.vn',
      phoneNumber: '0907777777',
      departmentId: 'dept-a-01',
      positionId: 'pos-a-01',
      contractSalary: 20000000,
      hireDate: '2026-03-01',
      gender: 'MALE' as const,
      status: 'ACTIVE' as const,
      contractType: 'PROBATION' as const,
      hourlyRate: 0,
      insuranceSalary: 0,
      dependentsCount: 0,
      documents: [],
    };

    // Direct call without allowOwnerOnboarding flag must fail with 403
    await expect(
      EmployeeService.createEmployee(payload, activeOwnerSessionWithoutAdminRole)
    ).rejects.toThrow('Chỉ Quản trị viên hoặc Nhân sự mới có quyền thêm nhân viên mới.');
  });

  // --------------------------------------------------------------------------
  // 6. Concurrency & Prisma P2002 Race Condition Handling (Requirement 3)
  // --------------------------------------------------------------------------
  it('6.1 When concurrent request hits P2002 but has exact same identity, recovers idempotently with success', async () => {
    const org = dbState.organizations.get('org-tenant-a');
    org.onboardingStep = 6;

    const payload = {
      firstName: 'Đồng',
      lastName: 'Thời',
      employeeCode: 'EMP-CONCURRENT-01',
      email: 'concurrent01@tenanta.vn',
      phoneNumber: '0901112233',
      departmentId: 'dept-a-01',
      positionId: 'pos-a-01',
      contractSalary: 25000000,
    };

    // Pre-create the record in database as if Request A committed just after Request B pre-checked
    const userA = {
      id: 'usr-concurrent-01',
      email: payload.email.toLowerCase().trim(),
      isActive: true,
    };
    dbState.users.set(userA.id, userA);

    const empA = {
      id: 'emp-concurrent-01',
      userId: userA.id,
      organizationId: 'org-tenant-a',
      employeeCode: payload.employeeCode.toUpperCase().trim(),
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      contractSalary: payload.contractSalary,
      hourlyRate: 0,
      insuranceSalary: 0,
      documents: [],
      deletedAt: null,
    };
    dbState.employees.set(empA.id, empA);

    // Mock $transaction to throw Prisma P2002 on attempt to insert
    const originalTx = mockPrisma.$transaction;
    mockPrisma.$transaction = vi.fn().mockRejectedValue({
      code: 'P2002',
      message: 'Unique constraint failed on the fields: (`email`)',
    });

    try {
      const result = await OnboardingService.saveStep(activeOwnerSession, 6, payload);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.createdData.employeeCode).toBe('EMP-CONCURRENT-01');
      expect(dbState.organizations.get('org-tenant-a').onboardingStep).toBe(7);
    } finally {
      // Restore $transaction
      mockPrisma.$transaction = originalTx;
    }
  });

  it('6.2 When concurrent request hits P2002 with a DIFFERENT identity, rejects with HTTP 409 Conflict', async () => {
    const org = dbState.organizations.get('org-tenant-a');
    org.onboardingStep = 6;

    const payload = {
      firstName: 'Người',
      lastName: 'Khác',
      employeeCode: 'EMP-CONCURRENT-DIFF',
      email: 'diff@tenanta.vn',
      phoneNumber: '0901119999',
      departmentId: 'dept-a-01',
      positionId: 'pos-a-01',
      contractSalary: 25000000,
    };

    // Pre-create a colliding record with different name in the database
    const userColliding = {
      id: 'usr-colliding-01',
      email: payload.email.toLowerCase().trim(),
      isActive: true,
    };
    dbState.users.set(userColliding.id, userColliding);

    const empColliding = {
      id: 'emp-colliding-01',
      userId: userColliding.id,
      organizationId: 'org-tenant-a',
      employeeCode: payload.employeeCode.toUpperCase().trim(),
      firstName: 'Tên',
      lastName: 'Gốc',
      contractSalary: 25000000,
      deletedAt: null,
    };
    dbState.employees.set(empColliding.id, empColliding);

    // Mock $transaction to throw Prisma P2002
    const originalTx = mockPrisma.$transaction;
    mockPrisma.$transaction = vi.fn().mockRejectedValue({
      code: 'P2002',
      message: 'Unique constraint failed on the fields: (`employeeCode`)',
    });

    try {
      await expect(
        OnboardingService.saveStep(activeOwnerSession, 6, payload)
      ).rejects.toThrow('Mã nhân viên [EMP-CONCURRENT-DIFF] đã tồn tại trong tổ chức.');

      // Step must NOT advance
      expect(dbState.organizations.get('org-tenant-a').onboardingStep).toBe(6);
    } finally {
      // Restore $transaction
      mockPrisma.$transaction = originalTx;
    }
  });

  // --------------------------------------------------------------------------
  // 7. Non-regression of onboardingStep if current step is already >= 7 (Requirement 4)
  // --------------------------------------------------------------------------
  it('7. When organization.onboardingStep is already 8 (as on live staging), Step 6 does NOT regress to 7', async () => {
    const org = dbState.organizations.get('org-tenant-a');
    org.onboardingStep = 8; // Exactly matching staging org 32b15bd9-b243-4ebb-9f2b-32a22b94055b

    const payload = {
      firstName: 'Giữ',
      lastName: 'Bước',
      employeeCode: 'EMP-STEP8',
      email: 'step8@tenanta.vn',
      phoneNumber: '0908888777',
      departmentId: 'dept-a-01',
      positionId: 'pos-a-01',
      contractSalary: 20000000,
    };

    const result = await OnboardingService.saveStep(activeOwnerSession, 6, payload);
    expect(result.success).toBe(true);
    expect(result.createdData.employeeCode).toBe('EMP-STEP8');

    // CRITICAL: onboardingStep must remain 8, NOT regressed to 7!
    expect(dbState.organizations.get('org-tenant-a').onboardingStep).toBe(8);
  });
});
