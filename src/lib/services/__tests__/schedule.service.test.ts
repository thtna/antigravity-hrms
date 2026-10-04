import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '@/types';

const mockPrisma = vi.hoisted(() => ({
  workShift: {
    findUnique: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
  },
  employeeSchedule: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  recurringSchedule: {
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ScheduleService } from '@/lib/services/schedule.service';

const adminSession = {
  userId: 'usr-admin',
  organizationId: 'org-001',
  roles: ['admin' as const],
  email: 'admin@test.com',
  fullName: 'Admin User',
  permissions: [],
  isActive: true,
};

describe('R2A schedule business-date behavior', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));
    mockPrisma.workShift.findUnique.mockResolvedValue({
      id: 'shift-001',
      code: 'STD',
      organizationId: 'org-001',
      isActive: true,
      deletedAt: null,
    });
    mockPrisma.employee.findUnique.mockResolvedValue({
      id: 'emp-001',
      organizationId: 'org-001',
      employeeCode: 'EMP-001',
      firstName: 'A',
      lastName: 'Nguyen',
      status: 'ACTIVE',
      deletedAt: null,
    });
    mockPrisma.employeeSchedule.findUnique.mockResolvedValue(null);
    mockPrisma.employeeSchedule.create.mockImplementation(async ({ data }: any) => ({
      id: 'schedule-001',
      ...data,
    }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('selects weekdays from deterministic Vietnam business-date carriers', async () => {
    const result = await ScheduleService.bulkAssignSchedule(
      {
        employeeIds: ['emp-001'],
        shiftId: 'shift-001',
        startDate: '2026-09-06',
        endDate: '2026-09-07',
        daysOfWeek: [0],
        isTemporary: false,
      },
      adminSession
    );

    expect(result).toEqual({ created: 1, updated: 0, totalDates: 1 });
    expect(mockPrisma.employeeSchedule.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.employeeSchedule.create.mock.calls[0][0].data.workDate).toEqual(
      new Date('2026-09-06T00:00:00.000Z')
    );
  });
});

describe('G06 schedule write tenant authorization', () => {
  const employee = { id: 'emp-001', organizationId: 'org-001', status: 'ACTIVE', deletedAt: null };
  const shift = { id: 'shift-001', organizationId: 'org-001', code: 'STD', isActive: true, deletedAt: null };
  const operations = [
    { name: 'assignSingleSchedule', run: (session: UserSession) => ScheduleService.assignSingleSchedule({ employeeId: employee.id, shiftId: shift.id, workDate: '2026-09-07', isTemporary: false }, session) },
    { name: 'bulkAssignSchedule', run: (session: UserSession) => ScheduleService.bulkAssignSchedule({ employeeIds: [employee.id], shiftId: shift.id, startDate: '2026-09-07', endDate: '2026-09-07', daysOfWeek: [1], isTemporary: false }, session) },
    { name: 'assignRecurringPattern', run: (session: UserSession) => ScheduleService.assignRecurringPattern({ employeeId: employee.id, shiftId: shift.id, effectiveFrom: '2026-09-07', daysOfWeek: [1] }, session) },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma));
    mockPrisma.workShift.findUnique.mockResolvedValue(shift);
    mockPrisma.employee.findUnique.mockResolvedValue(employee);
    mockPrisma.employeeSchedule.findUnique.mockResolvedValue(null);
    mockPrisma.employeeSchedule.create.mockImplementation(async ({ data }) => ({ id: 'schedule-001', ...data }));
    mockPrisma.recurringSchedule.create.mockImplementation(async ({ data }) => ({ id: 'recurring-001', ...data }));
    mockPrisma.recurringSchedule.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  const expectNoWrites = () => {
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.employeeSchedule.create).not.toHaveBeenCalled();
    expect(mockPrisma.employeeSchedule.update).not.toHaveBeenCalled();
    expect(mockPrisma.recurringSchedule.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.recurringSchedule.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  };

  describe.each(operations)('$name', ({ run }) => {
    it.each([undefined, null, '', '   '])('rejects missing organization context %s before employee/shift lookup', async (organizationId) => {
      await expect(run({ ...adminSession, organizationId })).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.employee.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.workShift.findUnique).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it('rejects a foreign employee before writes', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ ...employee, organizationId: 'org-other' });
      await expect(run(adminSession)).rejects.toMatchObject({ statusCode: 403 });
      expectNoWrites();
    });

    it('rejects a foreign shift before writes', async () => {
      mockPrisma.workShift.findUnique.mockResolvedValue({ ...shift, organizationId: 'org-other' });
      await expect(run(adminSession)).rejects.toMatchObject({ statusCode: 403 });
      expectNoWrites();
    });

    it('rejects matching employee/shift tenants that differ from the session tenant', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ ...employee, organizationId: 'org-other' });
      mockPrisma.workShift.findUnique.mockResolvedValue({ ...shift, organizationId: 'org-other' });
      await expect(run(adminSession)).rejects.toMatchObject({ statusCode: 403 });
      expectNoWrites();
    });

    it.each(['admin', 'hr', 'manager'] as const)('preserves same-tenant %s scheduling without widening role policy', async (role) => {
      await run({ ...adminSession, roles: [role] });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ organizationId: adminSession.organizationId }),
      }));
      const createdSchedules = [
        ...mockPrisma.employeeSchedule.create.mock.calls,
        ...mockPrisma.recurringSchedule.create.mock.calls,
      ];
      expect(createdSchedules).toHaveLength(1);
      expect(createdSchedules[0][0].data.organizationId).toBe(adminSession.organizationId);
    });
  });
});
