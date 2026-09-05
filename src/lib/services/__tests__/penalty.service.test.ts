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

import { PenaltyService } from '@/lib/services/penalty.service';
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

const mockPenalty = {
  id: 'pen-001',
  employeeId: 'emp-001',
  type: 'PENALTY',
  category: 'LATE',
  amount: '200000',
  effectiveDate: new Date('2026-09-10'),
  period: '2026-09',
  reason: 'Đi làm muộn 45 phút không xin phép',
  notes: 'Đã nhắc nhở lần 1',
  status: 'PENDING',
  approvedBy: null,
  approvedAt: null,
  approvalNotes: null,
  createdAt: new Date('2026-09-10T08:45:00Z'),
  updatedAt: new Date('2026-09-10T08:45:00Z'),
  employee: {
    id: 'emp-001',
    employeeCode: 'EMP001',
    firstName: 'Van A',
    lastName: 'Nguyen',
    departmentId: 'dept-eng',
    department: mockDepartment,
  },
  approver: null,
};

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('PHASE 13 — PENALTY SERVICE TEST SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  // ── 1. createPenalty Tests ─────────────────────────────────────────────────
  describe('1. createPenalty', () => {
    it('should block regular employees from creating penalty', async () => {
      await expect(
        PenaltyService.createPenalty(
          {
            employeeId: 'emp-002',
            category: 'LATE',
            amount: 100000,
            effectiveDate: '2026-09-10',
            period: '2026-09',
            reason: 'Đi muộn',
          },
          employeeSession
        )
      ).rejects.toThrow('Chỉ Quản lý, HR hoặc Quản trị viên mới có quyền lập biên bản xử phạt.');
    });

    it('should block employee/manager from creating penalty for oneself (Self-Penalty Block)', async () => {
      await expect(
        PenaltyService.createPenalty(
          {
            employeeId: 'emp-mgr', // same as session.employeeId
            category: 'LATE',
            amount: 100000,
            effectiveDate: '2026-09-10',
            period: '2026-09',
            reason: 'Tự phạt bản thân',
          },
          managerSession
        )
      ).rejects.toThrow('Không được phép tự tạo quyết định xử phạt cho chính mình.');
    });

    it('should block manager from penalizing employee outside managed department', async () => {
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce({ ...mockEmployee, departmentId: 'dept-other' }) // target employee
        .mockResolvedValueOnce({
          id: 'emp-mgr',
          managedDepartments: [{ id: 'dept-eng' }],
        }); // manager

      await expect(
        PenaltyService.createPenalty(
          {
            employeeId: 'emp-001',
            category: 'UNAUTHORIZED_LEAVE',
            amount: 500000,
            effectiveDate: '2026-09-10',
            period: '2026-09',
            reason: 'Nghỉ không phép',
          },
          managerSession
        )
      ).rejects.toThrow(
        'Bạn chỉ có quyền lập biên bản xử phạt cho nhân viên thuộc phòng ban mình quản lý.'
      );
    });

    it('should allow manager to penalize employee inside managed department and write AuditLog', async () => {
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce({ ...mockEmployee, departmentId: 'dept-eng' }) // target employee
        .mockResolvedValueOnce({
          id: 'emp-mgr',
          managedDepartments: [{ id: 'dept-eng' }],
        }); // manager
      mockPrisma.employeeBonusPenalty.create.mockResolvedValue({ ...mockPenalty });

      const res = await PenaltyService.createPenalty(
        {
          employeeId: 'emp-001',
          category: 'LATE',
          amount: 200000,
          effectiveDate: '2026-09-10',
          period: '2026-09',
          reason: 'Đi làm muộn 45 phút',
        },
        managerSession
      );

      expect(res.id).toBe('pen-001');
      expect(mockPrisma.employeeBonusPenalty.create).toHaveBeenCalledOnce();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_PENALTY_RECORD',
            entity: 'EmployeeBonusPenalty',
            actorId: 'usr-mgr',
          }),
        })
      );
    });

    it('should allow HR/Admin to penalize any employee and write AuditLog', async () => {
      mockPrisma.employee.findUnique.mockResolvedValueOnce({ ...mockEmployee });
      mockPrisma.employeeBonusPenalty.create.mockResolvedValue({ ...mockPenalty });

      const res = await PenaltyService.createPenalty(
        {
          employeeId: 'emp-001',
          category: 'KPI_MISS',
          amount: 1000000,
          effectiveDate: '2026-09-10',
          period: '2026-09',
          reason: 'Không đạt KPI tối thiểu 50%',
        },
        hrSession
      );

      expect(res.id).toBe('pen-001');
      expect(mockPrisma.employeeBonusPenalty.create).toHaveBeenCalledOnce();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_PENALTY_RECORD',
            actorId: 'usr-hr',
          }),
        })
      );
    });
  });

  // ── 2. updatePenalty Tests (Financial Lock) ───────────────────────────────
  describe('2. updatePenalty & Financial Lock', () => {
    it('should allow updating PENDING penalty and record old/new diff in AuditLog', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({ ...mockPenalty, status: 'PENDING' });
      mockPrisma.employeeBonusPenalty.update.mockResolvedValue({
        ...mockPenalty,
        amount: '300000',
        reason: 'Đi làm muộn 60 phút',
      });

      const res = await PenaltyService.updatePenalty(
        'pen-001',
        {
          amount: 300000,
          reason: 'Đi làm muộn 60 phút',
        },
        hrSession
      );

      expect(res.amount).toBe('300000');
      expect(mockPrisma.employeeBonusPenalty.update).toHaveBeenCalledOnce();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'UPDATE_PENALTY_BEFORE_APPROVAL',
            entityId: 'pen-001',
          }),
        })
      );
    });

    it('should BLOCK updating an APPROVED penalty (Financial Lock)', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockPenalty,
        status: 'APPROVED',
      });

      await expect(
        PenaltyService.updatePenalty(
          'pen-001',
          { amount: 500000 },
          adminSession
        )
      ).rejects.toThrow('Biên bản xử phạt đã ở trạng thái APPROVED, không thể chỉnh sửa.');
      expect(mockPrisma.employeeBonusPenalty.update).not.toHaveBeenCalled();
    });

    it('should BLOCK updating a REJECTED penalty (Financial Lock)', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockPenalty,
        status: 'REJECTED',
      });

      await expect(
        PenaltyService.updatePenalty(
          'pen-001',
          { reason: 'Thay đổi lý do' },
          hrSession
        )
      ).rejects.toThrow('Biên bản xử phạt đã ở trạng thái REJECTED, không thể chỉnh sửa.');
      expect(mockPrisma.employeeBonusPenalty.update).not.toHaveBeenCalled();
    });
  });

  // ── 3. processPenalty Tests (Approval / Rejection) ─────────────────────────
  describe('3. processPenalty', () => {
    it('should approve penalty and set approvedBy, approvedAt, and AuditLog', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockPenalty,
        status: 'PENDING',
      });
      mockPrisma.employeeBonusPenalty.update.mockResolvedValue({
        ...mockPenalty,
        status: 'APPROVED',
        approvedBy: 'emp-admin',
        approvedAt: new Date(),
      });

      const res = await PenaltyService.processPenalty(
        'pen-001',
        { decision: 'APPROVED', approvalNotes: 'Đồng ý khấu trừ theo quy chế' },
        adminSession
      );

      expect(res.status).toBe('APPROVED');
      expect(mockPrisma.employeeBonusPenalty.update).toHaveBeenCalledOnce();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'APPROVE_PENALTY',
            entityId: 'pen-001',
          }),
        })
      );
    });

    it('should reject penalty with required explanation and log REJECT_PENALTY', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockPenalty,
        status: 'PENDING',
      });
      mockPrisma.employeeBonusPenalty.update.mockResolvedValue({
        ...mockPenalty,
        status: 'REJECTED',
        approvalNotes: 'Có giấy xác nhận nhập viện khẩn cấp',
      });

      const res = await PenaltyService.processPenalty(
        'pen-001',
        { decision: 'REJECTED', approvalNotes: 'Có giấy xác nhận nhập viện khẩn cấp' },
        hrSession
      );

      expect(res.status).toBe('REJECTED');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REJECT_PENALTY',
            entityId: 'pen-001',
          }),
        })
      );
    });

    it('should BLOCK manager from self-approving penalty applied to oneself', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockPenalty,
        employeeId: 'emp-mgr', // penalty belongs to manager
        status: 'PENDING',
      });

      await expect(
        PenaltyService.processPenalty(
          'pen-001',
          { decision: 'APPROVED' },
          managerSession
        )
      ).rejects.toThrow('Không được phép tự phê duyệt/từ chối biên bản xử phạt của chính mình.');
    });

    it('should BLOCK manager from approving penalty for employee outside managed department', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockPenalty,
        status: 'PENDING',
        employee: { id: 'emp-001', departmentId: 'dept-other' },
      });
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-mgr',
        managedDepartments: [{ id: 'dept-eng' }],
      });

      await expect(
        PenaltyService.processPenalty(
          'pen-001',
          { decision: 'APPROVED' },
          managerSession
        )
      ).rejects.toThrow(
        'Bạn chỉ có quyền phê duyệt xử phạt cho nhân viên thuộc phòng ban mình quản lý.'
      );
    });

    it('should block processing when penalty is already processed', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        ...mockPenalty,
        status: 'APPROVED',
      });

      await expect(
        PenaltyService.processPenalty(
          'pen-001',
          { decision: 'APPROVED' },
          adminSession
        )
      ).rejects.toThrow('Biên bản xử phạt này đã ở trạng thái APPROVED.');
    });
  });

  // ── 4. listPenalties Tests (RBAC Scoping) ──────────────────────────────────
  describe('4. listPenalties & RBAC Scoping', () => {
    it('should scope regular employee to only see their own penalties', async () => {
      mockPrisma.employeeBonusPenalty.count.mockResolvedValue(1);
      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([{ ...mockPenalty }]);

      await PenaltyService.listPenalties({ status: 'ALL', page: 1, limit: 20 }, employeeSession);

      const queryArgs = mockPrisma.employeeBonusPenalty.findMany.mock.calls[0][0];
      expect(queryArgs.where.employeeId).toBe('emp-001');
      expect(queryArgs.where.type).toBe('PENALTY');
    });

    it('should allow Admin/HR to view all penalties across departments', async () => {
      mockPrisma.employeeBonusPenalty.count.mockResolvedValue(10);
      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([]);

      await PenaltyService.listPenalties({ status: 'ALL', page: 1, limit: 20 }, adminSession);

      const queryArgs = mockPrisma.employeeBonusPenalty.findMany.mock.calls[0][0];
      expect(queryArgs.where.employeeId).toBeUndefined();
      expect(queryArgs.where.type).toBe('PENALTY');
    });

    it('should scope manager to own penalties OR employees in managed departments', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-mgr',
        managedDepartments: [{ id: 'dept-eng' }],
      });
      mockPrisma.employeeBonusPenalty.count.mockResolvedValue(2);
      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([]);

      await PenaltyService.listPenalties({ status: 'ALL', page: 1, limit: 20 }, managerSession);

      const queryArgs = mockPrisma.employeeBonusPenalty.findMany.mock.calls[0][0];
      expect(queryArgs.where.OR).toBeDefined();
      expect(queryArgs.where.type).toBe('PENALTY');
    });
  });

  // ── 5. Audit Trail & Metrics ───────────────────────────────────────────────
  describe('5. Audit Trail & Dashboard Metrics', () => {
    it('should retrieve immutable audit trail for a penalty record', async () => {
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({ ...mockPenalty });
      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-01',
          action: 'CREATE_PENALTY_RECORD',
          entity: 'EmployeeBonusPenalty',
          entityId: 'pen-001',
          actor: { id: 'usr-admin', email: 'admin@test.com' },
          createdAt: new Date(),
        },
      ]);

      const logs = await PenaltyService.getPenaltyAuditTrail('pen-001', adminSession);

      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('CREATE_PENALTY_RECORD');
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entity: 'EmployeeBonusPenalty', entityId: 'pen-001' },
        })
      );
    });

    it('should calculate dashboard metrics and category breakdown', async () => {
      mockPrisma.employeeBonusPenalty.count.mockResolvedValue(2); // pendingCount
      mockPrisma.employeeBonusPenalty.findMany
        .mockResolvedValueOnce([{ amount: '500000' }]) // total approved
        .mockResolvedValueOnce([{ amount: '200000' }]) // late
        .mockResolvedValueOnce([{ amount: '300000' }]) // unauthorized leave
        .mockResolvedValueOnce([]) // kpi miss
        .mockResolvedValueOnce([]); // other

      const summary = await PenaltyService.getPenaltyDashboardSummary(adminSession);

      expect(summary.pendingCount).toBe(2);
      expect(summary.totalApprovedAmount).toBe(500000);
      expect(summary.categories.late).toBe(200000);
      expect(summary.categories.unauthorizedLeave).toBe(300000);
      expect(summary.categories.kpiMiss).toBe(0);
      expect(summary.categories.other).toBe(0);
    });
  });
});
