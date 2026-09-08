import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserSession } from '@/types';
import { ApiError } from '@/lib/errors';
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';

const { dbState, mockPrisma, resetDbState } = vi.hoisted(() => {
  interface DbState {
    organizations: Map<string, any>;
    payrollRules: Map<string, any>;
    auditLogs: Array<any>;
    employees: Map<string, any>;
    departments: Map<string, any>;
    positions: Map<string, any>;
    branches: Map<string, any>;
    workShifts: Map<string, any>;
    worksites: Map<string, any>;
    attendances: Map<string, any>;
    leaveRequests: Map<string, any>;
    payrolls: Map<string, any>;
    kpis: Map<string, any>;
  }

  function createInitialState(): DbState {
    const state: DbState = {
      organizations: new Map(),
      payrollRules: new Map(),
      auditLogs: [],
      employees: new Map(),
      departments: new Map(),
      positions: new Map(),
      branches: new Map(),
      workShifts: new Map(),
      worksites: new Map(),
      attendances: new Map(),
      leaveRequests: new Map(),
      payrolls: new Map(),
      kpis: new Map(),
    };

    // Seed Tenant A (at step 8)
    state.organizations.set('org-tenant-a', {
      id: 'org-tenant-a',
      name: 'Tenant A Corp',
      status: 'ACTIVE',
      onboardingStep: 8,
      onboardingSkipped: false,
      onboardingCompletedAt: null,
      deletedAt: null,
    });

    // Seed Tenant B (at step 8, for tenant isolation tests)
    state.organizations.set('org-tenant-b', {
      id: 'org-tenant-b',
      name: 'Tenant B Corp',
      status: 'ACTIVE',
      onboardingStep: 8,
      onboardingSkipped: false,
      onboardingCompletedAt: null,
      deletedAt: null,
    });

    return state;
  }

  let state = createInitialState();

  const p: any = {
    organization: {
      findUnique: vi.fn(async ({ where }: any) => {
        return state.organizations.get(where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        return state.organizations.get(where?.id) || null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const org = state.organizations.get(where.id);
        if (!org) throw new Error('Org not found');
        const updated = { ...org, ...data };
        state.organizations.set(where.id, updated);
        return updated;
      }),
      count: vi.fn(async () => state.organizations.size),
    },

    payrollRule: {
      findFirst: vi.fn(async ({ where }: any) => {
        for (const rule of state.payrollRules.values()) {
          let match = true;
          if (where.organizationId && rule.organizationId !== where.organizationId) match = false;
          if (where.code && rule.code.toUpperCase() !== where.code.toUpperCase()) match = false;
          if (where.isDefault !== undefined && rule.isDefault !== where.isDefault) match = false;
          if (where.isActive !== undefined && rule.isActive !== where.isActive) match = false;
          if (match) return { ...rule };
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        const results: any[] = [];
        for (const rule of state.payrollRules.values()) {
          let match = true;
          if (where?.organizationId && rule.organizationId !== where.organizationId) match = false;
          if (where?.code && rule.code.toUpperCase() !== where.code.toUpperCase()) match = false;
          if (match) results.push({ ...rule });
        }
        return results;
      }),
      create: vi.fn(async ({ data }: any) => {
        // Enforce composite unique constraint [organizationId, code]
        for (const existing of state.payrollRules.values()) {
          if (
            existing.organizationId === data.organizationId &&
            existing.code.toUpperCase() === data.code.toUpperCase()
          ) {
            const error: any = new Error(
              `Unique constraint failed on the fields: (\`organization_id\`,\`code\`)`
            );
            error.code = 'P2002';
            throw error;
          }
        }
        const id = data.id || `rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const rule = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.payrollRules.set(id, rule);
        return { ...rule };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const [id, rule] of state.payrollRules.entries()) {
          let match = true;
          if (where?.organizationId && rule.organizationId !== where.organizationId) match = false;
          if (where?.isDefault !== undefined && rule.isDefault !== where.isDefault) match = false;
          if (match) {
            state.payrollRules.set(id, { ...rule, ...data });
            count++;
          }
        }
        return { count };
      }),
      count: vi.fn(async () => state.payrollRules.size),
    },

    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        const log = { id: `log-${Date.now()}`, createdAt: new Date(), ...data };
        state.auditLogs.push(log);
        return log;
      }),
    },

    employee: { count: vi.fn(async () => state.employees.size) },
    department: { count: vi.fn(async () => state.departments.size) },
    position: { count: vi.fn(async () => state.positions.size) },
    branch: { count: vi.fn(async () => state.branches.size) },
    workShift: { count: vi.fn(async () => state.workShifts.size) },
    worksite: { count: vi.fn(async () => state.worksites.size) },
    attendance: { count: vi.fn(async () => state.attendances.size) },
    leaveRequest: { count: vi.fn(async () => state.leaveRequests.size) },
    payroll: { count: vi.fn(async () => state.payrolls.size) },
    kpi: { count: vi.fn(async () => state.kpis.size) },

    $transaction: vi.fn(async (callbackOrArray: any) => {
      if (typeof callbackOrArray === 'function') {
        // Create transactional snapshot for rollback
        const snapshot = {
          organizations: new Map(state.organizations),
          payrollRules: new Map(state.payrollRules),
          auditLogs: [...state.auditLogs],
        };

        const txClient: any = {
          organization: {
            findUnique: p.organization.findUnique,
            findFirst: p.organization.findFirst,
            update: p.organization.update,
          },
          payrollRule: {
            findFirst: p.payrollRule.findFirst,
            findMany: p.payrollRule.findMany,
            create: p.payrollRule.create,
            updateMany: p.payrollRule.updateMany,
          },
          auditLog: {
            create: p.auditLog.create,
          },
        };

        try {
          return await callbackOrArray(txClient);
        } catch (error) {
          // Rollback in-memory state on error
          state.organizations = snapshot.organizations;
          state.payrollRules = snapshot.payrollRules;
          state.auditLogs = snapshot.auditLogs;
          throw error;
        }
      }
      return Promise.all(callbackOrArray);
    }),
  };

    const findFirstImpl = async ({ where }: any) => {
      for (const rule of state.payrollRules.values()) {
        let match = true;
        if (where.organizationId && rule.organizationId !== where.organizationId) match = false;
        if (where.code && rule.code.toUpperCase() !== where.code.toUpperCase()) match = false;
        if (where.isDefault !== undefined && rule.isDefault !== where.isDefault) match = false;
        if (where.isActive !== undefined && rule.isActive !== where.isActive) match = false;
        if (match) return { ...rule };
      }
      return null;
    };

    p.payrollRule.findFirst = vi.fn(findFirstImpl);

    return {
      dbState: state,
      mockPrisma: p,
      resetDbState: () => {
        state = createInitialState();
        p.payrollRule.findFirst.mockImplementation(findFirstImpl);
      },
    };
  });

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { OnboardingService } from '../onboarding.service';

describe('PHASE 11A.0D — ONBOARDING STEP 8 REGRESSION SUITE', () => {
  const tenantAOwner: UserSession = {
    userId: 'usr-owner-a',
    email: 'owner@tenanta.com',
    fullName: 'Owner Tenant A',
    roles: ['admin'],
    tenantRole: 'OWNER',
    organizationId: 'org-tenant-a',
    organizationName: 'Tenant A Corp',
    permissions: [],
    isActive: true,
    onboardingStep: 8,
    needsOnboarding: true,
  };

  const tenantBOwner: UserSession = {
    userId: 'usr-owner-b',
    email: 'owner@tenantb.com',
    fullName: 'Owner Tenant B',
    roles: ['admin'],
    tenantRole: 'OWNER',
    organizationId: 'org-tenant-b',
    organizationName: 'Tenant B Corp',
    permissions: [],
    isActive: true,
    onboardingStep: 8,
    needsOnboarding: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetDbState();
  });

  // ── Scenario 1: First Step 8 succeeds ──────────────────────────────────────
  it('Scenario 1: first Step 8 submission creates payroll rule and completes onboarding', async () => {
    const step8Payload = {
      ruleCode: 'VN_STATUTORY_2026',
      ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
      standardWorkDays: 22,
      useStatutoryVietnam: true,
    };

    const res = await OnboardingService.saveStep(tenantAOwner, 8, step8Payload);

    expect(res.success).toBe(true);
    expect(res.completedStep).toBe(8);
    expect(res.nextStep).toBe(9);
    expect(res.createdData).toBeDefined();
    expect(res.createdData.code).toBe('VN_STATUTORY_2026');
    expect(res.createdData.organizationId).toBe('org-tenant-a');

    // Organization state in DB must be completed
    const org = await mockPrisma.organization.findUnique({ where: { id: 'org-tenant-a' } });
    expect(org.onboardingStep).toBe(9);
    expect(org.onboardingCompletedAt).toBeInstanceOf(Date);

    // Exactly 1 rule in DB for Tenant A
    const rules = await mockPrisma.payrollRule.findMany({ where: { organizationId: 'org-tenant-a' } });
    expect(rules).toHaveLength(1);
    expect(rules[0].code).toBe('VN_STATUTORY_2026');
  });

  // ── Scenario 2: Retry with exact same data succeeds idempotently ───────────
  it('Scenario 2: retry with exact same data succeeds idempotently without duplicate rule', async () => {
    const step8Payload = {
      ruleCode: 'VN_STATUTORY_2026',
      ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
      standardWorkDays: 22,
      useStatutoryVietnam: true,
    };

    // First attempt
    const firstRes = await OnboardingService.saveStep(tenantAOwner, 8, step8Payload);
    expect(firstRes.success).toBe(true);

    const orgAfterFirst = await mockPrisma.organization.findUnique({ where: { id: 'org-tenant-a' } });
    const originalCompletedAt = orgAfterFirst.onboardingCompletedAt;

    // Retry attempt with exact same payload
    const retryRes = await OnboardingService.saveStep(tenantAOwner, 8, step8Payload);
    expect(retryRes.success).toBe(true);
    expect(retryRes.completedStep).toBe(8);
    expect(retryRes.nextStep).toBe(9);
    expect(retryRes.createdData.id).toBe(firstRes.createdData.id);

    // Rule count must remain strictly 1
    const rules = await mockPrisma.payrollRule.findMany({ where: { organizationId: 'org-tenant-a' } });
    expect(rules).toHaveLength(1);

    // Timestamp must NOT be overwritten
    const orgAfterRetry = await mockPrisma.organization.findUnique({ where: { id: 'org-tenant-a' } });
    expect(orgAfterRetry.onboardingStep).toBe(9);
    expect(orgAfterRetry.onboardingCompletedAt?.toISOString()).toBe(originalCompletedAt?.toISOString());
  });

  // ── Scenario 3: Partial success recovery ───────────────────────────────────
  it('Scenario 3: existing same-tenant matching rule completes onboarding (recovers partial success)', async () => {
    // Simulate pre-existing rule when org was left at step 8
    await mockPrisma.payrollRule.create({
      data: {
        organizationId: 'org-tenant-a',
        code: 'VN_STATUTORY_2026',
        name: 'Quy chế tiền lương Luật Lao Động 2026',
        isDefault: true,
        isActive: true,
        salaryBasisConfig: { ...VIETNAM_STATUTORY_RULE_2026.salaryBasis, standardWorkDays: 22 },
        overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime,
        insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance,
        taxConfig: VIETNAM_STATUTORY_RULE_2026.tax,
        deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction,
        roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding,
        effectiveFrom: new Date('2026-01-01'),
      },
    });

    const orgBefore = await mockPrisma.organization.findUnique({ where: { id: 'org-tenant-a' } });
    expect(orgBefore.onboardingStep).toBe(8);
    expect(orgBefore.onboardingCompletedAt).toBeNull();

    // Now submit Step 8
    const res = await OnboardingService.saveStep(tenantAOwner, 8, {
      ruleCode: 'VN_STATUTORY_2026',
      ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
      standardWorkDays: 22,
      useStatutoryVietnam: true,
    });

    expect(res.success).toBe(true);
    expect(res.nextStep).toBe(9);

    const orgAfter = await mockPrisma.organization.findUnique({ where: { id: 'org-tenant-a' } });
    expect(orgAfter.onboardingStep).toBe(9);
    expect(orgAfter.onboardingCompletedAt).toBeInstanceOf(Date);

    // Rule count is still 1
    const rules = await mockPrisma.payrollRule.findMany({ where: { organizationId: 'org-tenant-a' } });
    expect(rules).toHaveLength(1);
  });

  // ── Scenario 4: Tenant isolation (different tenant can use same code) ──────
  it('Scenario 4: Tenant B can create VN_STATUTORY_2026 independently without cross-tenant collision', async () => {
    // Tenant A creates VN_STATUTORY_2026
    await OnboardingService.saveStep(tenantAOwner, 8, {
      ruleCode: 'VN_STATUTORY_2026',
      ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
      standardWorkDays: 22,
      useStatutoryVietnam: true,
    });

    // Tenant B submits the exact same standard statutory code
    const resB = await OnboardingService.saveStep(tenantBOwner, 8, {
      ruleCode: 'VN_STATUTORY_2026',
      ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
      standardWorkDays: 22,
      useStatutoryVietnam: true,
    });

    expect(resB.success).toBe(true);
    expect(resB.createdData.organizationId).toBe('org-tenant-b');

    // Both tenants have their own rule
    const rulesA = await mockPrisma.payrollRule.findMany({ where: { organizationId: 'org-tenant-a' } });
    const rulesB = await mockPrisma.payrollRule.findMany({ where: { organizationId: 'org-tenant-b' } });
    expect(rulesA).toHaveLength(1);
    expect(rulesB).toHaveLength(1);
    expect(rulesA[0].id).not.toBe(rulesB[0].id);
  });

  // ── Scenario 5: Material mismatch throws 409 conflict ──────────────────────
  it('Scenario 5: same tenant same code with materially different config returns HTTP 409 conflict', async () => {
    // Create initial rule with 22 standard work days
    await OnboardingService.saveStep(tenantAOwner, 8, {
      ruleCode: 'VN_STATUTORY_2026',
      ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
      standardWorkDays: 22,
      useStatutoryVietnam: true,
    });

    // Attempt retry with different standardWorkDays (26 days)
    await expect(
      OnboardingService.saveStep(tenantAOwner, 8, {
        ruleCode: 'VN_STATUTORY_2026',
        ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
        standardWorkDays: 26,
        useStatutoryVietnam: true,
      })
    ).rejects.toThrow(ApiError);

    // Attempt retry with different name
    await expect(
      OnboardingService.saveStep(tenantAOwner, 8, {
        ruleCode: 'VN_STATUTORY_2026',
        ruleName: 'Quy chế thưởng doanh số đặc biệt',
        standardWorkDays: 22,
        useStatutoryVietnam: true,
      })
    ).rejects.toThrow(ApiError);
  });

  // ── Scenario 6: Transaction rollback if completion fails ───────────────────
  it('Scenario 6: transaction rollback if organization update fails (zero orphaned rule)', async () => {
    // Make organization.update fail inside transaction
    const originalOrgUpdate = mockPrisma.organization.update;
    mockPrisma.organization.update.mockRejectedValueOnce(new Error('DB Connection Dropped Mid-Flight'));

    await expect(
      OnboardingService.saveStep(tenantAOwner, 8, {
        ruleCode: 'VN_STATUTORY_2026',
        ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
        standardWorkDays: 22,
        useStatutoryVietnam: true,
      })
    ).rejects.toThrow('DB Connection Dropped Mid-Flight');

    // Rule must NOT exist in the database (rolled back)
    const rules = await mockPrisma.payrollRule.findMany({ where: { organizationId: 'org-tenant-a' } });
    expect(rules).toHaveLength(0);

    // Org must still be at step 8
    const org = await mockPrisma.organization.findUnique({ where: { id: 'org-tenant-a' } });
    expect(org.onboardingStep).toBe(8);
  });

  // ── Scenario 7: Zero duplicate payroll rules ───────────────────────────────
  it('Scenario 7: repeated Step 8 calls strictly result in exactly 1 payroll rule', async () => {
    const payload = {
      ruleCode: 'VN_STATUTORY_2026',
      ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
      standardWorkDays: 22,
      useStatutoryVietnam: true,
    };

    await OnboardingService.saveStep(tenantAOwner, 8, payload);
    await OnboardingService.saveStep(tenantAOwner, 8, payload);
    await OnboardingService.saveStep(tenantAOwner, 8, payload);

    const rules = await mockPrisma.payrollRule.findMany({ where: { organizationId: 'org-tenant-a' } });
    expect(rules).toHaveLength(1);
  });

  // ── Scenario 8: Completion state preservation ──────────────────────────────
  it('Scenario 8: if organization is already completed (step >= 9), step never regresses and timestamp is preserved', async () => {
    // Org already completed yesterday
    const completedYesterday = new Date('2026-09-07T10:00:00.000Z');
    await mockPrisma.organization.update({
      where: { id: 'org-tenant-a' },
      data: {
        onboardingStep: 9,
        onboardingCompletedAt: completedYesterday,
      },
    });

    // Seed the matching rule
    await mockPrisma.payrollRule.create({
      data: {
        organizationId: 'org-tenant-a',
        code: 'VN_STATUTORY_2026',
        name: 'Quy chế tiền lương Luật Lao Động 2026',
        isDefault: true,
        isActive: true,
        salaryBasisConfig: { ...VIETNAM_STATUTORY_RULE_2026.salaryBasis, standardWorkDays: 22 },
        overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime,
        insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance,
        taxConfig: VIETNAM_STATUTORY_RULE_2026.tax,
        deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction,
        roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding,
        effectiveFrom: new Date('2026-01-01'),
      },
    });

    // Re-submit Step 8
    const res = await OnboardingService.saveStep(tenantAOwner, 8, {
      ruleCode: 'VN_STATUTORY_2026',
      ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
      standardWorkDays: 22,
      useStatutoryVietnam: true,
    });

    expect(res.success).toBe(true);
    expect(res.nextStep).toBe(9);

    const orgAfter = await mockPrisma.organization.findUnique({ where: { id: 'org-tenant-a' } });
    expect(orgAfter.onboardingStep).toBe(9);
    expect(orgAfter.onboardingCompletedAt?.toISOString()).toBe(completedYesterday.toISOString());
  });

  // ── Scenario 9: Dashboard completion status ────────────────────────────────
  it('Scenario 9: status returned from Step 8 reports isCompleted: true and onboardingStep: 9', async () => {
    const res = await OnboardingService.saveStep(tenantAOwner, 8, {
      ruleCode: 'VN_STATUTORY_2026',
      ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
      standardWorkDays: 22,
      useStatutoryVietnam: true,
    });

    expect(res.status).toBeDefined();
    expect(res.status.isCompleted).toBe(true);
    expect(res.status.onboardingStep).toBe(9);
    expect(res.status.onboardingSkipped).toBe(false);
  });

  // ── Scenario 10: Concurrency P2002 race condition recovery ─────────────────
  it('Scenario 10: recovers gracefully when concurrent request triggers P2002 unique constraint', async () => {
    // Simulate concurrent thread B having committed the rule right after thread A's pre-check
    await mockPrisma.payrollRule.create({
      data: {
        organizationId: 'org-tenant-a',
        code: 'VN_STATUTORY_2026',
        name: 'Quy chế tiền lương Luật Lao Động 2026',
        isDefault: true,
        isActive: true,
        salaryBasisConfig: { ...VIETNAM_STATUTORY_RULE_2026.salaryBasis, standardWorkDays: 22 },
        overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime,
        insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance,
        taxConfig: VIETNAM_STATUTORY_RULE_2026.tax,
        deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction,
        roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding,
        effectiveFrom: new Date('2026-01-01'),
      },
    });

    // Thread A's initial pre-check returned null (simulating race condition before seeing B's write)
    mockPrisma.payrollRule.findFirst.mockResolvedValueOnce(null);

    const res = await OnboardingService.saveStep(tenantAOwner, 8, {
      ruleCode: 'VN_STATUTORY_2026',
      ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
      standardWorkDays: 22,
      useStatutoryVietnam: true,
    });

    expect(res.success).toBe(true);
    expect(res.nextStep).toBe(9);
    expect(res.createdData.code).toBe('VN_STATUTORY_2026');

    const org = await mockPrisma.organization.findUnique({ where: { id: 'org-tenant-a' } });
    expect(org.onboardingStep).toBe(9);
  });

  // ── Scenario 11: Dashboard completion predicate regression ─────────────────
  it('Scenario 11: completed organization at step 9 guarantees needsOnboarding is false', async () => {
    // Organization completed at step 9
    await mockPrisma.organization.update({
      where: { id: 'org-tenant-a' },
      data: {
        onboardingStep: 9,
        onboardingCompletedAt: new Date(),
      },
    });

    const status = await OnboardingService.getOnboardingStatus(tenantAOwner);

    expect(status.isCompleted).toBe(true);
    expect(status.onboardingStep).toBe(9);

    // Dynamic evaluation check:
    const org = await mockPrisma.organization.findUnique({
      where: { id: 'org-tenant-a' },
      select: { onboardingStep: true, onboardingSkipped: true },
    });

    const isOwner = tenantAOwner.tenantRole === 'OWNER';
    const liveNeedsOnboarding = isOwner && org.onboardingStep < 9 && !org.onboardingSkipped;

    expect(liveNeedsOnboarding).toBe(false);
  });
});
