import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  employeeSchedule: {
    findMany: vi.fn(),
  },
  attendance: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  leaveRequest: {
    findMany: vi.fn(),
  },
  notification: {
    deleteMany: vi.fn(),
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/cache/cache-manager', () => ({
  CachedLookupService: {
    getActiveWorksites: vi.fn().mockResolvedValue([]),
    getDefaultPayrollRule: vi.fn().mockResolvedValue(null),
  },
}));

import { JobRunner } from '../job-runner';

describe('R2A-DERIVED-D1 JobRunner business-date behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([]);
    mockPrisma.attendance.findMany.mockResolvedValue([]);
    mockPrisma.attendance.upsert.mockResolvedValue({ id: 'attendance-absent' });
    mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses Vietnam yesterday and performs no mutation when no schedule exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T17:19:00.000Z'));

    const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION');

    expect(result.status).toBe('SUCCESS');
    expect(result.details).toEqual({
      reconciledDate: '2026-09-30',
      processed: 0,
      markedAbsent: 0,
    });
    expect(mockPrisma.employeeSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workDate: new Date('2026-09-30T00:00:00.000Z'),
      }),
    }));
    expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.upsert).not.toHaveBeenCalled();
  });

  it('uses one canonical target DATE for schedule, attendance, leave, and ABSENT upsert', async () => {
    const workDate = new Date('2026-09-15T00:00:00.000Z');
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([{
      id: 'schedule-1',
      employeeId: 'employee-1',
      workDate,
      organizationId: 'organization-1',
    }]);

    const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', {
      targetDate: '2026-09-15',
      organizationId: 'organization-1',
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.details).toEqual(expect.objectContaining({
      reconciledDate: '2026-09-15',
      totalScheduled: 1,
      markedAbsent: 1,
    }));
    expect(mockPrisma.employeeSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workDate, organizationId: 'organization-1' }),
    }));
    expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workDate }),
    }));
    expect(mockPrisma.leaveRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        startDate: { lte: workDate },
        endDate: { gte: workDate },
      }),
    }));
    expect(mockPrisma.attendance.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId_workDate: { employeeId: 'employee-1', workDate } },
      create: expect.objectContaining({ workDate, status: 'ABSENT' }),
    }));
  });

  it('rejects an impossible explicit target date before database access', async () => {
    const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', {
      targetDate: '2026-02-30',
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/khong ton tai/i);
    expect(mockPrisma.employeeSchedule.findMany).not.toHaveBeenCalled();
  });

  it('keeps notification pruning as elapsed-time instant semantics', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 3 });

    const result = await JobRunner.runJob('NOTIFICATION_PRUNING', { retentionDays: 2 });

    expect(result.status).toBe('SUCCESS');
    expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        isRead: true,
        createdAt: { lt: new Date('2026-09-29T00:00:00.000Z') },
      },
    });
    expect(result.details).toEqual({
      retentionDays: 2,
      cutoffDate: '2026-09-29T00:00:00.000Z',
      prunedCount: 3,
    });
  });
});
