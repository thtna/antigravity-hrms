import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist Prisma & Logger Mocks ──────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  employeeBonusPenalty: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
  },
  auditLog: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { BonusService } from '@/lib/services/bonus.service';
import { UserSession } from '@/types';

// ── Fixture Sessions ─────────────────────────────────────────────────────────

const adminSession: UserSession = {
  userId: 'usr-admin',
  employeeId: 'emp-admin',
  roles: ['admin'],
  email: 'admin@test.com',
  fullName: 'Admin User',
  permissions: [],
  isActive: true,
};

const hrSession: UserSession = {
  userId: 'usr-hr',
  employeeId: 'emp-hr',
  roles: ['hr'],
  email: 'hr@test.com',
  fullName: 'HR User',
  permissions: [],
  isActive: true,
};

const managerSession: UserSession = {
  userId: 'usr-mgr',
  employeeId: 'emp-mgr',
  roles: ['manager'],
  email: 'manager@test.com',
  fullName: 'Manager User',
  permissions: [],
  isActive: true,
};

const employeeSession: UserSession = {
  userId: 'usr-emp',
  employeeId: 'emp-001',
  roles: ['employee'],
  email: 'emp@test.com',
  fullName: 'Employee One',
  permissions: [],
  isActive: true,
};

// ── Mock Data ────────────────────────────────────────────────────────────────

const mockDepartment = {
  id: 'dept-eng',
  code: 'ENG',
  name: 'Phòng Kỹ Thuật',
};

const mockEmployee = {
  id: 'emp-001',
  employeeCode: 'EMP001',
  firstName: 'Van A',
  lastName: 'Nguyen',
  departmentId: 'dept-eng',
  status: 'ACTIVE',
  deletedAt: null,
  department: mockDepartment,
  managedDepartments: [],
};

const mockBonus = {
  id: 'bon-001',
  employeeId: 'emp-001',
  type: 'BONUS',
  category: 'PROJECT',
  amount: '5000000',
  effectiveDate: new Date('2026-09-15'),
  period: '2026-09',
  reason: 'Hoàn thành bàn giao dự án đúng tiến độ',
  notes: 'Được khách hàng khen ngợi',
  status: 'PENDING',
  approvedBy: null,
  approvedAt: null,
  approvalNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  employee: mockEmployee,
  approver: null,
};

function setupTransaction() {
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('PHASE 12 — BONUS SYSTEM TEST SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
  });

  // ── 1. Create Bonus ────────────────────────────────────────────────────────

  describe('1. BonusService.createBonus', () => {
    it('allows HR to propose a bonus for an employee', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
      mockPrisma.employeeBonusPenalty.create.mockResolvedValue({ ...mockBonus });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await BonusService.createBonus(
        {
          employeeId: 'emp-001',
          category: 'PROJECT',
          amount: 5_000_000,
          period: '2026-09',
          effectiveDate: '2026-09-15',
          reason: 'Hoàn thành bàn giao dự án đúng tiến độ',
        },
        hrSession
      );

      expect(mockPrisma.employeeBonusPenalty.create).toHaveBeenCalledOnce();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce();
      expect(result.status).toBe('PENDING');
      expect(result.category).toBe('PROJECT');
    });

    it('supports all required bonus types (KPI, OVERTIME, PROJECT, TIME, OTHER)', async () => {
      const types = ['KPI', 'OVERTIME', 'PROJECT', 'TIME', 'OTHER'] as const;

      for (const cat of types) {
        mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
        mockPrisma.employeeBonusPenalty.create.mockResolvedValue({
          ...mockBonus,
          category: cat,
        });
        mockPrisma.auditLog.create.mockResolvedValue({});

        const res = await BonusService.createBonus(
          {
            employeeId: 'emp-001',
            category: cat,
            amount: 2_000_000,
            period: '2026-09',
            reason: `Thưởng theo loại ${cat}`,
          },
          adminSession
        );

        expect(res.category).toBe(cat);
      }
    });

    it('throws 404 when proposing bonus for inactive or non-existent employee', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        BonusService.createBonus(
          {
            employeeId: 'emp-none',
            category: 'KPI',
            amount: 1_000_000,
            period: '2026-09',
            reason: 'Test',
          },
          hrSession
        )
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── 2. Edit Trước Approval ─────────────────────────────────────────────────

  describe('2. BonusService.updateBonus — Edit Before Approval', () => {
    it('allows updating amount and reason when status is PENDING', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({ ...mockBonus });
      mockPrisma.employeeBonusPenalty.update.mockResolvedValue({
        ...mockBonus,
        amount: '7000000',
        reason: 'Nâng mức thưởng lên 7M do thành tích vượt trội',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const updated = await BonusService.updateBonus(
        'bon-001',
        {
          amount: 7_000_000,
          reason: 'Nâng mức thưởng lên 7M do thành tích vượt trội',
        },
        hrSession
      );

      expect(mockPrisma.employeeBonusPenalty.update).toHaveBeenCalledOnce();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce();
      expect(updated.amount).toBe('7000000');

      // Verify audit log tracked old & new values
      const auditCall = mockPrisma.auditLog.create.mock.calls[0][0];
      expect(auditCall.data.action).toBe('UPDATE_BONUS_BEFORE_APPROVAL');
      expect(auditCall.data.oldValues).toHaveProperty('amount', 5_000_000);
      expect(auditCall.data.newValues).toHaveProperty('amount', 7_000_000);
    });

    it('CRITICAL: blocks editing if bonus is already APPROVED (HTTP 400)', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockBonus,
        status: 'APPROVED',
      });

      await expect(
        BonusService.updateBonus(
          'bon-001',
          { amount: 10_000_000 },
          adminSession
        )
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('CRITICAL: blocks editing if bonus is already REJECTED (HTTP 400)', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockBonus,
        status: 'REJECTED',
      });

      await expect(
        BonusService.updateBonus(
          'bon-001',
          { amount: 10_000_000 },
          adminSession
        )
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ── 3. Approval & Rejection Workflow ───────────────────────────────────────

  describe('3. BonusService.processBonus — Approval & Rejection', () => {
    it('HR can approve a PENDING bonus, recording approver and timestamp', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({ ...mockBonus });
      mockPrisma.employeeBonusPenalty.update.mockResolvedValue({
        ...mockBonus,
        status: 'APPROVED',
        approvedBy: 'emp-hr',
        approvedAt: new Date(),
        approvalNotes: 'Đồng ý duyệt thưởng',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const approved = await BonusService.processBonus(
        'bon-001',
        { decision: 'APPROVED', approvalNotes: 'Đồng ý duyệt thưởng' },
        hrSession
      );

      expect(mockPrisma.employeeBonusPenalty.update).toHaveBeenCalledOnce();
      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedBy).toBe('emp-hr');

      const auditCall = mockPrisma.auditLog.create.mock.calls[0][0];
      expect(auditCall.data.action).toBe('APPROVE_BONUS');
    });

    it('HR can reject a PENDING bonus with required notes', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({ ...mockBonus });
      mockPrisma.employeeBonusPenalty.update.mockResolvedValue({
        ...mockBonus,
        status: 'REJECTED',
        approvedBy: 'emp-hr',
        approvedAt: new Date(),
        approvalNotes: 'Chưa đủ chứng từ nghiệm thu',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const rejected = await BonusService.processBonus(
        'bon-001',
        { decision: 'REJECTED', approvalNotes: 'Chưa đủ chứng từ nghiệm thu' },
        hrSession
      );

      expect(rejected.status).toBe('REJECTED');
    });

    it('SELF-APPROVAL BLOCK: Manager cannot approve their own bonus (403)', async () => {
      // Bonus belongs to the manager themselves
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockBonus,
        employeeId: 'emp-mgr',
        employee: { ...mockEmployee, id: 'emp-mgr' },
      });

      await expect(
        BonusService.processBonus(
          'bon-001',
          { decision: 'APPROVED' },
          managerSession
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('blocks manager from approving bonus for employee in other department (403)', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockBonus,
        employee: { ...mockEmployee, departmentId: 'dept-marketing' },
      });
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce({ departmentId: 'dept-marketing' }) // target employee
        .mockResolvedValueOnce({ managedDepartments: [{ id: 'dept-eng' }] }); // manager

      await expect(
        BonusService.processBonus(
          'bon-001',
          { decision: 'APPROVED' },
          managerSession
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('blocks regular employee from approving bonuses (403)', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({ ...mockBonus });

      await expect(
        BonusService.processBonus(
          'bon-001',
          { decision: 'APPROVED' },
          employeeSession
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('cannot process a non-PENDING bonus (400)', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockBonus,
        status: 'APPROVED',
      });

      await expect(
        BonusService.processBonus(
          'bon-001',
          { decision: 'REJECTED', approvalNotes: 'Hủy duyệt' },
          hrSession
        )
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ── 4. Query & History ─────────────────────────────────────────────────────

  describe('4. BonusService.listBonuses & RBAC scoping', () => {
    it('employee sees only their own bonuses', async () => {
      mockPrisma.employeeBonusPenalty.count.mockResolvedValue(1);
      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([{ ...mockBonus }]);

      await BonusService.listBonuses({ status: 'ALL', page: 1, limit: 20 }, employeeSession);

      const queryArgs = mockPrisma.employeeBonusPenalty.findMany.mock.calls[0][0];
      expect(queryArgs.where).toHaveProperty('employeeId', 'emp-001');
    });

    it('HR sees all bonuses across departments', async () => {
      mockPrisma.employeeBonusPenalty.count.mockResolvedValue(10);
      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([]);

      await BonusService.listBonuses({ status: 'ALL', page: 1, limit: 20 }, hrSession);

      const queryArgs = mockPrisma.employeeBonusPenalty.findMany.mock.calls[0][0];
      expect(queryArgs.where).not.toHaveProperty('employeeId');
      expect(queryArgs.where).not.toHaveProperty('OR');
    });

    it('filters correctly by category and period', async () => {
      mockPrisma.employeeBonusPenalty.count.mockResolvedValue(2);
      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([]);

      await BonusService.listBonuses(
        { category: 'OVERTIME', period: '2026-09', status: 'APPROVED', page: 1, limit: 20 },
        hrSession
      );

      const queryArgs = mockPrisma.employeeBonusPenalty.findMany.mock.calls[0][0];
      expect(queryArgs.where).toHaveProperty('category', 'OVERTIME');
      expect(queryArgs.where).toHaveProperty('period', '2026-09');
      expect(queryArgs.where).toHaveProperty('status', 'APPROVED');
    });
  });

  // ── 5. Financial Audit Trail ───────────────────────────────────────────────

  describe('5. BonusService.getBonusAuditTrail', () => {
    it('retrieves full immutable financial audit logs for a bonus record', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({ ...mockBonus });
      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          action: 'CREATE_BONUS_PROPOSAL',
          entity: 'EmployeeBonusPenalty',
          entityId: 'bon-001',
          oldValues: null,
          newValues: { amount: 5_000_000 },
          createdAt: new Date(),
        },
        {
          id: 'log-2',
          action: 'UPDATE_BONUS_BEFORE_APPROVAL',
          entity: 'EmployeeBonusPenalty',
          entityId: 'bon-001',
          oldValues: { amount: 5_000_000 },
          newValues: { amount: 7_000_000 },
          createdAt: new Date(),
        },
      ]);

      const logs = await BonusService.getBonusAuditTrail('bon-001', hrSession);
      expect(logs.length).toBe(2);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entity: 'EmployeeBonusPenalty', entityId: 'bon-001' },
        })
      );
    });
  });

  // ── 6. Summary & Metrics ───────────────────────────────────────────────────

  describe('6. BonusService.getBonusDashboardSummary', () => {
    it('aggregates approved amounts by category and counts', async () => {
      mockPrisma.employeeBonusPenalty.count
        .mockResolvedValueOnce(3) // pendingCount
        .mockResolvedValueOnce(5); // approvedCount

      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([
        { category: 'KPI', amount: '3000000' },
        { category: 'OVERTIME', amount: '1500000' },
        { category: 'PROJECT', amount: '5000000' },
        { category: 'TIME', amount: '1000000' },
        { category: 'OTHER', amount: '500000' },
      ]);

      const summary = await BonusService.getBonusDashboardSummary(hrSession);

      expect(summary.pendingCount).toBe(3);
      expect(summary.approvedCount).toBe(5);
      expect(summary.totalApprovedAmount).toBe(11_000_000);
      expect(summary.categoryTotals.KPI).toBe(3_000_000);
      expect(summary.categoryTotals.OVERTIME).toBe(1_500_000);
      expect(summary.categoryTotals.PROJECT).toBe(5_000_000);
      expect(summary.categoryTotals.TIME).toBe(1_000_000);
      expect(summary.categoryTotals.OTHER).toBe(500_000);
    });
  });
});
