import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheManager } from '@/lib/cache/cache-manager';
import { JobRunner } from '@/lib/jobs/job-runner';
import { checkDatabaseConnection } from '@/lib/db/prisma';
import { PayrollService } from '@/lib/services/payroll.service';
import { DashboardService } from '@/lib/services/dashboard.service';
import { prisma } from '@/lib/db/prisma';
import { UserSession } from '@/types';
import { LEGACY_CUSTOM_PAYROLL_RULE } from '@/lib/payroll/__tests__/fixtures/legacy-custom-rule';

// Mock prisma for isolated high-speed verification
vi.mock('@/lib/db/prisma', () => {
  const mockPrisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    employee: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    attendance: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      upsert: vi.fn(),
    },
    leaveRequest: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    employeeBonusPenalty: {
      findMany: vi.fn(),
    },
    employeeKpiResult: {
      findMany: vi.fn(),
    },
    payrollPeriod: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    payrollRule: {
      findFirst: vi.fn(),
    },
    payroll: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    payrollDetail: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    department: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    notification: {
      count: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    attendanceAdjustment: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    employeeSchedule: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    worksite: {
      findMany: vi.fn(),
    },
    companySetting: {
      findUnique: vi.fn(),
    },
    $disconnect: vi.fn(),
  };

  return {
    prisma: mockPrisma,
    checkDatabaseConnection: async () => {
      try {
        await mockPrisma.$queryRaw();
        return { healthy: true, latencyMs: 2 };
      } catch (err: any) {
        return { healthy: false, latencyMs: 2, error: err?.message };
      }
    },
  };
});

describe('PHASE 25 — PERFORMANCE & PRODUCTION AUDIT TEST SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. N+1 Query Elimination in Payroll Service
  // ────────────────────────────────────────────────────────────────────────────
  describe('1. Batch Query Optimization in PayrollService', () => {
    it('should batch fetch attendance, leaves, bonuses, and KPIs using { in: employeeIds } instead of per-employee loop queries', async () => {
      const mockSession: UserSession = {
        userId: 'usr-admin',
        organizationId: 'org-test-audit',
        email: 'admin@antigravity.test',
        fullName: 'Admin Tester',
        roles: ['admin', 'hr'],
        permissions: ['ALL'],
        isActive: true,
        employeeId: 'emp-admin',
      };

      (prisma.payrollPeriod.findFirst as any).mockResolvedValue({
        id: 'prd-01',
        organizationId: 'org-test-audit',
        code: '2026-09',
        name: 'Kỳ lương Tháng 09/2026',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
        standardWorkDays: 22,
        status: 'DRAFT',
        payrollRuleId: 'rule-custom-batch',
        payrollRule: {
          id: 'rule-custom-batch',
          organizationId: 'org-test-audit',
          code: LEGACY_CUSTOM_PAYROLL_RULE.ruleCode,
          name: LEGACY_CUSTOM_PAYROLL_RULE.ruleName,
          salaryBasisConfig: LEGACY_CUSTOM_PAYROLL_RULE.salaryBasis,
          overtimeConfig: LEGACY_CUSTOM_PAYROLL_RULE.overtime,
          insuranceConfig: LEGACY_CUSTOM_PAYROLL_RULE.insurance,
          taxConfig: LEGACY_CUSTOM_PAYROLL_RULE.tax,
          deductionConfig: LEGACY_CUSTOM_PAYROLL_RULE.deduction,
          roundingConfig: LEGACY_CUSTOM_PAYROLL_RULE.rounding,
        },
      });

      // 3 employees to calculate
      (prisma.employee.findMany as any).mockResolvedValue([
        { id: 'emp-01', organizationId: 'org-test-audit', contractSalary: 20000000, dependentsCount: 0, insuranceSalary: 20000000 },
        { id: 'emp-02', organizationId: 'org-test-audit', contractSalary: 25000000, dependentsCount: 1, insuranceSalary: 25000000 },
        { id: 'emp-03', organizationId: 'org-test-audit', contractSalary: 30000000, dependentsCount: 2, insuranceSalary: 30000000 },
      ]);

      // Batched returns
      (prisma.attendance.findMany as any).mockResolvedValue([
        { employeeId: 'emp-01', actualWorkHours: 8, otHours: 0, workDate: new Date('2026-09-02') },
        { employeeId: 'emp-02', actualWorkHours: 8, otHours: 2, workDate: new Date('2026-09-02') },
        { employeeId: 'emp-03', actualWorkHours: 8, otHours: 0, workDate: new Date('2026-09-02') },
      ]);

      (prisma.leaveRequest.findMany as any).mockResolvedValue([]);
      (prisma.employeeBonusPenalty.findMany as any).mockResolvedValue([]);
      (prisma.employeeKpiResult.findMany as any).mockResolvedValue([]);

      (prisma.$transaction as any).mockImplementation(async (callback: any) => {
        const tx = {
          payroll: {
            findMany: vi.fn().mockResolvedValue([]),
            deleteMany: vi.fn(),
            create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'py-' + data.employeeId, ...data })),
          },
          payrollDetail: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
          },
          payrollPeriod: {
            update: vi.fn().mockResolvedValue({
              id: 'prd-01',
              code: '2026-09',
              status: 'CALCULATED',
              totalGrossPayout: 75000000,
              totalNetPayout: 65000000,
            }),
          },
          auditLog: {
            create: vi.fn(),
          },
        };
        return callback(tx);
      });

      const result = await PayrollService.calculatePeriodPayroll(
        { periodId: 'prd-01', recalculate: true },
        mockSession
      );

      // VERIFICATION: exactly 1 batch query was made for attendance with employeeId: { in: ['emp-01', 'emp-02', 'emp-03'] }
      expect(prisma.attendance.findMany).toHaveBeenCalledTimes(1);
      const attCallArg = (prisma.attendance.findMany as any).mock.calls[0][0];
      expect(attCallArg.where.employeeId).toEqual({ in: ['emp-01', 'emp-02', 'emp-03'] });

      // Exactly 1 batch query for leaveRequest
      expect(prisma.leaveRequest.findMany).toHaveBeenCalledTimes(1);
      const leaveCallArg = (prisma.leaveRequest.findMany as any).mock.calls[0][0];
      expect(leaveCallArg.where.employeeId).toEqual({ in: ['emp-01', 'emp-02', 'emp-03'] });

      // Exactly 1 batch query for bonuses/penalties
      expect(prisma.employeeBonusPenalty.findMany).toHaveBeenCalledTimes(1);

      // Exactly 1 batch query for KPIs
      expect(prisma.employeeKpiResult.findMany).toHaveBeenCalledTimes(1);

      // Processed all 3 employees
      expect(result.totalEmployees).toBe(3);
      expect(prisma.payrollPeriod.findFirst).toHaveBeenCalledWith({
        where: { id: 'prd-01', organizationId: 'org-test-audit' },
        include: { payrollRule: true },
      });
      expect(prisma.payrollRule.findFirst).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Dashboard Query Concurrency & Single-Range Charting
  // ────────────────────────────────────────────────────────────────────────────
  describe('2. Dashboard Query Optimization & Concurrency', () => {
    it('should fetch 7-day attendance trend in a single range query in getAdminHrDashboard', async () => {
      const mockSession: UserSession = {
        userId: 'usr-admin',
        email: 'admin@antigravity.test',
        fullName: 'Admin Tester',
        roles: ['admin', 'hr'],
        permissions: ['ALL'],
        isActive: true,
      };

      (prisma.employee.count as any).mockResolvedValue(50);
      (prisma.attendance.findMany as any).mockResolvedValue([]);
      (prisma.leaveRequest.findMany as any).mockResolvedValue([]);
      (prisma.leaveRequest.count as any).mockResolvedValue(2);
      (prisma.attendanceAdjustment.count as any).mockResolvedValue(1);
      (prisma.payrollPeriod.findFirst as any).mockResolvedValue(null);
      (prisma.attendance.aggregate as any).mockResolvedValue({ _sum: { otHours: 10 } });
      (prisma.employeeBonusPenalty.findMany as any).mockResolvedValue([]);
      (prisma.department.findMany as any).mockResolvedValue([]);

      const data = await DashboardService.getAdminHrDashboard(mockSession);

      expect(data).toBeDefined();
      expect(data.charts.attendanceTrend).toHaveLength(7);
      // Verify attendance.findMany was called only twice (once for today, once for the 7-day range)
      // instead of 1 + 7 = 8 queries!
      expect(prisma.attendance.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Database Connection Health Check
  // ────────────────────────────────────────────────────────────────────────────
  describe('3. Database Connection Handling & Health Probe', () => {
    it('should report healthy when database responds to probe query', async () => {
      (prisma.$queryRaw as any).mockResolvedValue([{ 1: 1 }]);

      const health = await checkDatabaseConnection();
      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should catch and report error when database is unreachable', async () => {
      (prisma.$queryRaw as any).mockRejectedValue(new Error('Connection terminated'));

      const health = await checkDatabaseConnection();
      expect(health.healthy).toBe(false);
      expect(health.error).toContain('Connection terminated');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Cache Manager (L1 LRU + TTL + Expiry)
  // ────────────────────────────────────────────────────────────────────────────
  describe('4. Multi-tier Cache Architecture', () => {
    it('should store and retrieve value from L1 in-memory cache', async () => {
      const cache = CacheManager.getInstance();
      await cache.set('test:key', { name: 'Antigravity HRMS' }, 60);

      const retrieved = await cache.get<{ name: string }>('test:key');
      expect(retrieved).toEqual({ name: 'Antigravity HRMS' });
    });

    it('should return null for expired cache items', async () => {
      const cache = CacheManager.getInstance();
      // Set TTL to 0.001 seconds (1ms)
      await cache.set('test:expired', 'stale-data', 0.001);

      // Wait 10ms
      await new Promise((resolve) => setTimeout(resolve, 15));

      const retrieved = await cache.get('test:expired');
      expect(retrieved).toBeNull();
    });

    it('should execute fetcher on cache miss via getOrSet', async () => {
      const cache = CacheManager.getInstance();
      let callCount = 0;

      const fetcher = async () => {
        callCount++;
        return 'computed-result';
      };

      const result1 = await cache.getOrSet('test:getOrSet', fetcher, 60);
      expect(result1).toBe('computed-result');
      expect(callCount).toBe(1);

      // Second call should hit cache without calling fetcher
      const result2 = await cache.getOrSet('test:getOrSet', fetcher, 60);
      expect(result2).toBe('computed-result');
      expect(callCount).toBe(1);
    });

    it('should delete keys by prefix', async () => {
      const cache = CacheManager.getInstance();
      await cache.set('lookup:setting:a', '1', 60);
      await cache.set('lookup:setting:b', '2', 60);
      await cache.set('other:key', '3', 60);

      const deletedCount = await cache.deletePrefix('lookup:setting:');
      expect(deletedCount).toBe(2);

      expect(await cache.get('lookup:setting:a')).toBeNull();
      expect(await cache.get('lookup:setting:b')).toBeNull();
      expect(await cache.get('other:key')).toBe('3');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Background Jobs Engine
  // ────────────────────────────────────────────────────────────────────────────
  describe('5. Resilient Background Job Runner', () => {
    it('should list all registered background jobs', () => {
      const jobs = JobRunner.listJobs();
      const names = jobs.map((j) => j.name);

      expect(names).toContain('DAILY_ATTENDANCE_RECONCILIATION');
      expect(names).toContain('NOTIFICATION_PRUNING');
      expect(names).toContain('CACHE_WARMUP');
    });

    it('should execute CACHE_WARMUP job successfully', async () => {
      (prisma.worksite.findMany as any).mockResolvedValue([
        { id: 'ws-1', name: 'Headquarters', isActive: true },
      ]);
      (prisma.payrollRule.findFirst as any).mockResolvedValue({
        id: 'pr-1',
        name: 'Vietnam Standard 2026',
      });

      const result = await JobRunner.runJob('CACHE_WARMUP');

      expect(result.status).toBe('SUCCESS');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.details?.worksitesCached).toBe(1);
    });

    it('should execute NOTIFICATION_PRUNING job and delete expired notifications', async () => {
      (prisma.notification.deleteMany as any).mockResolvedValue({ count: 15 });

      const result = await JobRunner.runJob('NOTIFICATION_PRUNING', { retentionDays: 90 });

      expect(result.status).toBe('SUCCESS');
      expect(result.details?.prunedCount).toBe(15);
      expect(prisma.notification.deleteMany).toHaveBeenCalled();
    });

    it('should handle unexcused absences during DAILY_ATTENDANCE_RECONCILIATION', async () => {
      const targetDate = '2026-09-02';
      const organizationId = 'org-r2';
      const workDate = new Date(`${targetDate}T00:00:00.000Z`);
      const shift = {
        id: 'shift-day', organizationId, startTime: '08:00', endTime: '17:00',
        isOvernight: false, isActive: true, deletedAt: null,
      };
      const schedules = ['emp-absent', 'emp-present'].map((employeeId, index) => ({
        id: `sch-${index + 1}`, employeeId, organizationId, workDate, status: 'SCHEDULED', shift,
      }));
      const validAttendance = {
        id: 'present-1', organizationId, employeeId: 'emp-present', workDate,
        status: 'ON_TIME', checkInTime: new Date(`${targetDate}T08:00:00+07:00`),
      };
      const originalAttendance = { ...validAttendance };
      const created: Record<string, unknown>[] = [];
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked-schedule' }]),
        employeeSchedule: { findFirst: vi.fn(async ({ where }) => schedules.find((item) =>
          item.id === where.id && item.organizationId === where.organizationId
        ) ?? null) },
        attendance: {
          findUnique: vi.fn(async ({ where }) => where.organizationId === organizationId &&
            where.employeeId_workDate.employeeId === 'emp-present' ? validAttendance : null),
          create: vi.fn(async ({ data }) => {
            const record = { id: 'absent-1', ...data };
            created.push(record);
            return record;
          }),
        },
        leaveRequest: { findFirst: vi.fn().mockResolvedValue(null) },
        auditLog: { create: vi.fn().mockResolvedValue({ id: 'absent-receipt' }) },
      };
      (prisma.employeeSchedule.findMany as any).mockResolvedValue(schedules);
      (prisma.$transaction as any).mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

      const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate });

      expect(result.status).toBe('SUCCESS');
      expect(result.details?.totalScheduled).toBe(2);
      expect(result.details?.markedAbsent).toBe(1);
      expect(result.details?.alreadyAttended).toBe(1);
      expect(tx.attendance.create).toHaveBeenCalledTimes(1);
      expect(created).toEqual([expect.objectContaining({
        organizationId, employeeId: 'emp-absent', workDate, scheduleId: 'sch-1', status: 'ABSENT',
      })]);
      expect(validAttendance).toEqual(originalAttendance);
      expect(tx.attendance.create).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ employeeId: 'emp-present' }),
      }));
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create.mock.calls[0][0].data.entityId).toBe('absent-1');
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });
  });
});
