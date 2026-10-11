import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  employeeSchedule: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  attendance: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  leaveRequest: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
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
import { Prisma } from '@prisma/client';
import { RECONCILIATION_ABSENT_ACTION, RECONCILIATION_ABSENT_NOTES } from '@/lib/services/attendance.service';

const schedule = (workDate = '2026-09-15', overnight = false) => ({
  id: 'schedule-1', employeeId: 'employee-1', organizationId: 'organization-1',
  workDate: new Date(`${workDate}T00:00:00.000Z`), status: 'SCHEDULED',
  shift: {
    organizationId: 'organization-1', startTime: overnight ? '22:00' : '08:30',
    endTime: overnight ? '06:00' : '17:30', isOvernight: overnight,
    isActive: true, deletedAt: null,
  },
});

const uniqueConflict = () => new Prisma.PrismaClientKnownRequestError('Concurrent attendance', {
  code: 'P2002', clientVersion: '6.19.3',
  meta: { modelName: 'Attendance', target: ['employee_id', 'work_date'] },
});

describe('R2A-DERIVED-D1 JobRunner business-date behavior', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([]);
    mockPrisma.employeeSchedule.findFirst.mockResolvedValue(schedule());
    mockPrisma.attendance.findMany.mockResolvedValue([]);
    mockPrisma.attendance.findUnique.mockResolvedValue(null);
    mockPrisma.attendance.findFirst.mockResolvedValue(null);
    mockPrisma.attendance.create.mockImplementation(async ({ data }) => ({ id: 'attendance-absent', ...data }));
    mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
    mockPrisma.leaveRequest.findFirst.mockResolvedValue(null);
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma));
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'schedule-1' }]);
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
        workDate: {
          gte: new Date('2026-09-29T00:00:00.000Z'),
          lte: new Date('2026-09-30T00:00:00.000Z'),
        },
      }),
    }));
    expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.upsert).not.toHaveBeenCalled();
  });

  it('preserves the canonical start DATE for attendance, leave, and create-only ABSENT', async () => {
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
      where: expect.objectContaining({
        workDate,
        organizationId: 'organization-1',
      }),
    }));
    expect(mockPrisma.attendance.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId_workDate: { employeeId: 'employee-1', workDate }, organizationId: 'organization-1' },
    }));
    expect(mockPrisma.leaveRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'organization-1', employeeId: 'employee-1',
        startDate: { lte: workDate },
        endDate: { gte: workDate },
      }),
    }));
    expect(mockPrisma.attendance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workDate, status: 'ABSENT' }),
    }));
    expect(mockPrisma.attendance.upsert).not.toHaveBeenCalled();
  });

  it.each([false, true])('explicit targetDate excludes prior-day schedules when target exists=%s', async (targetExists) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T06:00:00+07:00'));
    const prior = { ...schedule('2026-09-14', true), id: 'schedule-prior', employeeId: 'employee-prior' };
    const target = { ...schedule(), id: 'schedule-target' };
    const available = targetExists ? [prior, target] : [prior];
    mockPrisma.employeeSchedule.findMany.mockImplementation(async ({ where }: {
      where: { workDate: Date | { gte: Date; lte: Date } };
    }) => available.filter((row) => where.workDate instanceof Date
      ? row.workDate.getTime() === where.workDate.getTime()
      : row.workDate >= where.workDate.gte && row.workDate <= where.workDate.lte));
    mockPrisma.employeeSchedule.findFirst.mockImplementation(async ({ where }) =>
      available.find((row) => row.id === where.id && row.organizationId === where.organizationId) ?? null);

    const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', {
      targetDate: '2026-09-15', organizationId: 'organization-1',
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.details?.markedAbsent).toBe(targetExists ? 1 : 0);
    expect(mockPrisma.employeeSchedule.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { workDate: target.workDate, status: 'SCHEDULED', organizationId: 'organization-1' },
      select: { id: true, employeeId: true, workDate: true, organizationId: true },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(targetExists ? 1 : 0);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(targetExists ? 1 : 0);
    expect(mockPrisma.employeeSchedule.findFirst).toHaveBeenCalledTimes(targetExists ? 1 : 0);
    expect(mockPrisma.attendance.findUnique).toHaveBeenCalledTimes(targetExists ? 1 : 0);
    expect(mockPrisma.leaveRequest.findFirst).toHaveBeenCalledTimes(targetExists ? 1 : 0);
    expect(mockPrisma.attendance.create).toHaveBeenCalledTimes(targetExists ? 1 : 0);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(targetExists ? 1 : 0);
    expect(mockPrisma.attendance.upsert).not.toHaveBeenCalled();
    if (targetExists) {
      expect(mockPrisma.$queryRaw.mock.calls[0][1]).toBe(target.id);
      expect(mockPrisma.employeeSchedule.findFirst.mock.calls[0][0].where).toMatchObject({
        id: target.id, employeeId: target.employeeId, workDate: target.workDate, organizationId: 'organization-1',
      });
      expect(mockPrisma.attendance.findUnique.mock.calls[0][0].where.employeeId_workDate).toEqual({
        employeeId: target.employeeId, workDate: target.workDate,
      });
      expect(mockPrisma.leaveRequest.findFirst.mock.calls[0][0].where).toMatchObject({
        employeeId: target.employeeId, startDate: { lte: target.workDate }, endDate: { gte: target.workDate },
      });
      expect(mockPrisma.attendance.create.mock.calls[0][0].data).toMatchObject({
        scheduleId: target.id, employeeId: target.employeeId, workDate: target.workDate, status: 'ABSENT',
      });
      expect(mockPrisma.auditLog.create.mock.calls[0][0].data.newValues).toMatchObject({
        scheduleId: target.id, employeeId: target.employeeId, workDate: '2026-09-15',
      });
    }
  });

  it('rejects a prior-day schedule returned for explicit targetDate before reading or mutating attendance', async () => {
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule('2026-09-14', true)]);

    const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', {
      targetDate: '2026-09-15', organizationId: 'organization-1',
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('Invalid reconciliation schedule scope.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockPrisma.employeeSchedule.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.leaveRequest.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-09-15', false, '2026-09-15T17:29:59+07:00', 0],
    ['2026-09-15', false, '2026-09-15T17:30:00+07:00', 1],
    ['2026-09-15', true, '2026-09-16T00:05:00+07:00', 0],
    ['2026-09-15', true, '2026-09-16T05:59:00+07:00', 0],
    ['2026-09-15', true, '2026-09-16T06:00:00+07:00', 1],
    ['2026-09-30', true, '2026-10-01T06:00:00+07:00', 1],
    ['2026-12-31', true, '2027-01-01T06:00:00+07:00', 1],
  ])('honors shift end: %s overnight=%s at %s', async (date, overnight, instant, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    const current = schedule(date, overnight);
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([current]);
    mockPrisma.employeeSchedule.findFirst.mockResolvedValue(current);
    const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: date });
    expect(result.status).toBe('SUCCESS');
    expect(mockPrisma.employeeSchedule.findMany.mock.calls[0][0].where.workDate).toEqual(current.workDate);
    expect(result.details?.markedAbsent).toBe(expected);
    expect(mockPrisma.attendance.create).toHaveBeenCalledTimes(expected);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(expected);
    if (expected) {
      expect(mockPrisma.attendance.create.mock.calls[0][0].data.workDate).toEqual(current.workDate);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        actorId: null, organizationId: current.organizationId,
        action: RECONCILIATION_ABSENT_ACTION, entityId: 'attendance-absent',
        newValues: expect.objectContaining({ version: 1, workDate: date, shiftEnd: new Date(instant).toISOString() }),
      }) });
    } else {
      expect(mockPrisma.attendance.findUnique).not.toHaveBeenCalled();
    }
  });

  it('revisits yesterday-skipped overnight work on the next midnight run', async () => {
    vi.useFakeTimers();
    const current = schedule('2026-09-15', true);
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([current]);
    mockPrisma.employeeSchedule.findFirst.mockResolvedValue(current);
    vi.setSystemTime(new Date('2026-09-16T00:05:00+07:00'));
    const skipped = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION');
    expect(skipped.status).toBe('SUCCESS');
    expect(skipped.details).toMatchObject({ markedAbsent: 0, notEnded: 1 });
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    vi.setSystemTime(new Date('2026-09-17T00:05:00+07:00'));
    const caughtUp = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION');
    expect(caughtUp.status).toBe('SUCCESS');
    expect(caughtUp.details).toMatchObject({ markedAbsent: 1, notEnded: 0 });
    expect(mockPrisma.attendance.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      data: expect.objectContaining({ workDate: current.workDate }),
    }));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.employeeSchedule.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workDate: {
        gte: new Date('2026-09-15T00:00:00.000Z'), lte: new Date('2026-09-16T00:00:00.000Z'),
      } }),
    }));
  });

  it('keeps attendance and approved leave independent for each start date in the lookback', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T00:05:00+07:00'));
    const prior = schedule('2026-09-14', true);
    const target = { ...schedule(), id: 'schedule-2' };
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([prior, target]);
    mockPrisma.employeeSchedule.findFirst.mockResolvedValueOnce(prior).mockResolvedValueOnce(target);
    mockPrisma.attendance.findUnique.mockResolvedValueOnce({ id: 'prior-attendance' }).mockResolvedValueOnce(null);
    const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { organizationId: 'organization-1' });
    expect(result.status).toBe('SUCCESS');
    expect(mockPrisma.employeeSchedule.findMany.mock.calls[0][0].where).toEqual({
      workDate: { gte: prior.workDate, lte: target.workDate }, status: 'SCHEDULED', organizationId: 'organization-1',
    });
    expect(result.details).toMatchObject({ alreadyAttended: 1, markedAbsent: 1 });
    expect(mockPrisma.attendance.create.mock.calls[0][0].data.workDate).toEqual(target.workDate);
    expect(mockPrisma.leaveRequest.findFirst.mock.calls[0][0].where.startDate).toEqual({ lte: target.workDate });
  });

  it('does not overwrite a valid attendance or create twice on repeated runs', async () => {
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule()]);
    let row: { id: string } | null = null;
    mockPrisma.attendance.findUnique.mockImplementation(async () => row);
    mockPrisma.attendance.create.mockImplementation(async () => { row = { id: 'created-once' }; return row; });
    const first = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' });
    const second = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' });
    expect(first.details?.markedAbsent).toBe(1);
    expect(second.details).toMatchObject({ markedAbsent: 0, alreadyAttended: 1 });
    expect(mockPrisma.attendance.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.attendance.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('skips an existing valid record and an approved leave without mutation', async () => {
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule()]);
    mockPrisma.attendance.findUnique.mockResolvedValue({ id: 'valid-punch' });
    expect((await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' })).details?.alreadyAttended).toBe(1);
    mockPrisma.attendance.findUnique.mockResolvedValue(null);
    mockPrisma.leaveRequest.findFirst.mockResolvedValue({ id: 'leave-1' });
    expect((await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' })).details?.onApprovedLeave).toBe(1);
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('handles two overlapping jobs using create-only uniqueness, with one receipt', async () => {
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule()]);
    let release!: () => void;
    const overlap = new Promise<void>((resolve) => { release = resolve; });
    let commit!: () => void;
    const committed = new Promise<void>((resolve) => { commit = resolve; });
    let winner: { id: string } | null = null;
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const result = await callback(mockPrisma);
      if (result === 'CREATED') { winner = { id: 'winner' }; commit(); }
      return result;
    });
    mockPrisma.attendance.findFirst.mockImplementation(async () => winner);
    let attempts = 0;
    mockPrisma.attendance.create.mockImplementation(async ({ data }) => {
      attempts++;
      if (attempts === 1) { await overlap; return { id: 'winner', ...data }; }
      release();
      await committed;
      throw uniqueConflict();
    });
    const results = await Promise.all([
      JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' }),
      JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' }),
    ]);
    expect(results.map((result) => result.status)).toEqual(['SUCCESS', 'SUCCESS']);
    expect(results.reduce((sum, result) => sum + result.details!.markedAbsent, 0)).toBe(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.attendance.upsert).not.toHaveBeenCalled();
  });

  it('does not overwrite a check-in that wins between the read and ABSENT insert', async () => {
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule()]);
    const validAttendance = { id: 'punch', status: 'IN_PROGRESS', checkInTime: new Date() };
    const before = { ...validAttendance };
    let row: typeof validAttendance | null = null;
    mockPrisma.attendance.create.mockImplementation(async () => {
      row = validAttendance;
      throw uniqueConflict();
    });
    mockPrisma.attendance.findFirst.mockImplementation(async () => row);
    const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' });
    expect(result.status).toBe('SUCCESS');
    expect(result.details).toMatchObject({ alreadyAttended: 1, markedAbsent: 0 });
    expect(validAttendance).toEqual(before);
    expect(row).toEqual(before);
    expect(mockPrisma.attendance.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'organization-1', employeeId: 'employee-1', workDate: schedule().workDate },
      select: { id: true },
    });
    expect(mockPrisma.attendance.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('fails rather than claiming a duplicate when P2002 has no matching persisted attendance', async () => {
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule()]);
    mockPrisma.attendance.create.mockRejectedValue(uniqueConflict());
    const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' });
    expect(result.status).toBe('FAILED');
    expect(mockPrisma.attendance.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([['id'], ['unknown_unique'], ['schedule_id', 'organization_id']])(
    'does not suppress an unrelated unique constraint %j', async (...target) => {
      mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule()]);
      mockPrisma.attendance.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unrelated unique failure', {
        code: 'P2002', clientVersion: '6.19.3', meta: { modelName: 'Attendance', target },
      }));
      expect((await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' })).status).toBe('FAILED');
      expect(mockPrisma.attendance.findFirst).not.toHaveBeenCalled();
    }
  );

  it('confirms a schedule-id collision belongs to the same tenant, employee and date', async () => {
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule()]);
    mockPrisma.attendance.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Schedule conflict', {
      code: 'P2002', clientVersion: '6.19.3', meta: { modelName: 'Attendance', target: ['schedule_id'] },
    }));
    mockPrisma.attendance.findFirst.mockResolvedValue({ id: 'winner' });
    expect((await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' })).status).toBe('SUCCESS');
    expect(mockPrisma.attendance.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: 'organization-1', employeeId: 'employee-1', workDate: schedule().workDate, scheduleId: 'schedule-1',
    });
    mockPrisma.attendance.findFirst.mockResolvedValue(null);
    expect((await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' })).status).toBe('FAILED');
  });

  it.each(['P1001', 'P2003', 'P2024'])('propagates %s rather than treating it as a duplicate', async (code) => {
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule()]);
    mockPrisma.attendance.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Database failure', { code, clientVersion: '6.19.3' }));
    expect((await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' })).status).toBe('FAILED');
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not swallow an audit P2002 and rolls the attendance transaction back', async () => {
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule()]);
    let committed: unknown = null;
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      let draft: unknown = null;
      const tx = { ...mockPrisma, attendance: { ...mockPrisma.attendance, create: vi.fn(async ({ data }) => {
        draft = { id: 'draft', ...data }; return draft;
      }) } };
      const result = await callback(tx);
      committed = draft;
      return result;
    });
    mockPrisma.auditLog.create.mockRejectedValue(uniqueConflict());
    const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' });
    expect(result.status).toBe('FAILED');
    expect(committed).toBeNull();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('applies tenant A to the schedule, employee, shift and leave predicates', async () => {
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule()]);
    await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15', organizationId: 'organization-1' });
    expect(mockPrisma.employeeSchedule.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: 'organization-1',
      employee: { organizationId: 'organization-1' }, shift: { organizationId: 'organization-1' },
    });
    expect(mockPrisma.leaveRequest.findFirst.mock.calls[0][0].where.organizationId).toBe('organization-1');
    expect(mockPrisma.attendance.create.mock.calls[0][0].data.organizationId).toBe('organization-1');
    const [sql, id, ...tenantIds] = mockPrisma.$queryRaw.mock.calls[0];
    expect(sql.join('?')).toContain('FOR SHARE OF s, sh, e');
    expect(id).toBe('schedule-1');
    expect(tenantIds).toEqual(['organization-1', 'organization-1', 'organization-1']);
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([{ ...schedule(), organizationId: 'organization-B' }]);
    expect((await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15', organizationId: 'organization-1' })).status).toBe('FAILED');
    expect(mockPrisma.attendance.create).toHaveBeenCalledTimes(1);
  });

  it('does not create or audit when the scoped schedule lock cannot be obtained', async () => {
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([schedule()]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' });
    expect(result.status).toBe('SUCCESS');
    expect(result.details?.markedAbsent).toBe(0);
    expect(mockPrisma.employeeSchedule.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    { startTime: '25:00' }, { endTime: '06:60' }, { startTime: '8:30' },
    { startTime: '22:00', endTime: '06:00', isOvernight: false },
    { startTime: '08:30', endTime: '17:30', isOvernight: true },
  ])('fails closed for invalid shift configuration %j', async (patch) => {
    const current = schedule();
    Object.assign(current.shift, patch);
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([current]);
    mockPrisma.employeeSchedule.findFirst.mockResolvedValue(current);
    expect((await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' })).status).toBe('FAILED');
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('accepts schema-supported seconds without marking ABSENT one second early', async () => {
    vi.useFakeTimers();
    const current = schedule();
    current.shift.startTime = '08:30:00'; current.shift.endTime = '17:30:15';
    mockPrisma.employeeSchedule.findMany.mockResolvedValue([current]);
    mockPrisma.employeeSchedule.findFirst.mockResolvedValue(current);
    vi.setSystemTime(new Date('2026-09-15T17:30:14+07:00'));
    expect((await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' })).details?.markedAbsent).toBe(0);
    vi.setSystemTime(new Date('2026-09-15T17:30:15+07:00'));
    expect((await JobRunner.runJob('DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2026-09-15' })).details?.markedAbsent).toBe(1);
    expect(mockPrisma.attendance.create.mock.calls[0][0].data.notes).toBe(RECONCILIATION_ABSENT_NOTES);
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
