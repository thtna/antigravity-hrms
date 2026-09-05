/**
 * PHASE 5 — WORK SHIFT & SCHEDULE TEST SUITE
 *
 * Tests:
 * 1. ShiftService.calculateShiftHours — normal, overnight, break, flexible
 * 2. ShiftService CRUD — create, update, toggle, delete (FK integrity)
 * 3. ScheduleService — single assign, bulk assign, recurring pattern
 * 4. Authorization — employee/manager/admin roles
 * 5. Overnight shift boundary precision
 * 6. Effective date handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Use vi.hoisted so mockPrisma is available BEFORE vi.mock factories run ──
const mockPrisma = vi.hoisted(() => ({
  workShift: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  employeeSchedule: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  recurringSchedule: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
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

import { ShiftService } from '@/lib/services/shift.service';
import { ScheduleService } from '@/lib/services/schedule.service';

// ── Fixture sessions ─────────────────────────────────────────────────────────

const adminSession = { userId: 'usr-admin', roles: ['admin' as const], email: 'admin@test.com', fullName: 'Admin', permissions: [], isActive: true };
const hrSession = { userId: 'usr-hr', roles: ['hr' as const], email: 'hr@test.com', fullName: 'HR', permissions: [], isActive: true };
const managerSession = { userId: 'usr-manager', roles: ['manager' as const], email: 'mgr@test.com', fullName: 'Manager', permissions: [], isActive: true };
const employeeSession = { userId: 'usr-emp', roles: ['employee' as const], email: 'emp@test.com', fullName: 'Employee', permissions: [], isActive: true };

// ── Fixture data ──────────────────────────────────────────────────────────────

const activeShift = {
  id: 'shift-001',
  code: 'CA-HANH-CHINH',
  name: 'Ca Hành Chính',
  shiftType: 'FIXED',
  startTime: '08:00',
  endTime: '17:30',
  breakMinutes: 60,
  isOvernight: false,
  gracePeriodLate: 15,
  gracePeriodEarly: 15,
  standardWorkHours: { toNumber: () => 8.5 },
  isActive: true,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { schedules: 0, recurringSchedules: 0 },
};

const overnightShift = {
  ...activeShift,
  id: 'shift-night',
  code: 'CA-DEM',
  name: 'Ca Đêm',
  startTime: '22:00',
  endTime: '06:00',
  isOvernight: true,
  breakMinutes: 30,
  standardWorkHours: { toNumber: () => 7.5 },
};

const activeEmployee = {
  id: 'emp-001',
  employeeCode: 'EMP-001',
  firstName: 'Văn A',
  lastName: 'Nguyễn',
  status: 'ACTIVE',
  deletedAt: null,
};

// ── 1. calculateShiftHours ────────────────────────────────────────────────────

describe('PHASE 5 — WORK SHIFT & SCHEDULE TEST SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default $transaction mock: executes callback immediately
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) =>
      cb(mockPrisma)
    );
  });

  describe('1. ShiftService.calculateShiftHours — Pure Logic Tests', () => {
    it('normal shift 08:00–17:30 with 60 min break → 8.5 working hours', () => {
      const result = ShiftService.calculateShiftHours('08:00', '17:30', 60);
      expect(result.totalSpanMinutes).toBe(570); // 9.5 hrs = 570 min
      expect(result.workingMinutes).toBe(510); // 510 min = 8.5 hrs
      expect(result.workingHours).toBe(8.5);
      expect(result.isOvernight).toBe(false);
    });

    it('overnight shift 22:00–06:00 with 30 min break → 7.5 working hours', () => {
      const result = ShiftService.calculateShiftHours('22:00', '06:00', 30);
      // Span: (1440 - 22*60) + 6*60 = (1440-1320)+360 = 120+360 = 480 min
      expect(result.totalSpanMinutes).toBe(480);
      expect(result.workingMinutes).toBe(450); // 480 - 30
      expect(result.workingHours).toBe(7.5);
      expect(result.isOvernight).toBe(true);
    });

    it('auto-detects overnight when endTime < startTime even if isOvernightInput=false', () => {
      const result = ShiftService.calculateShiftHours('23:00', '07:00', 60, false);
      expect(result.isOvernight).toBe(true);
      expect(result.totalSpanMinutes).toBe(480); // (1440-1380)+420 = 60+420
      expect(result.workingMinutes).toBe(420);
    });

    it('zero-break shift 09:00–18:00 → 9.0 working hours', () => {
      const result = ShiftService.calculateShiftHours('09:00', '18:00', 0);
      expect(result.workingMinutes).toBe(540);
      expect(result.workingHours).toBe(9.0);
    });

    it('FLEXIBLE shift uses customStandardHours instead of calculated hours', () => {
      const result = ShiftService.calculateShiftHours('08:00', '17:00', 60, false, 'FLEXIBLE', 8.0);
      expect(result.workingHours).toBe(8.0);
      expect(result.standardWorkHours).toBe(8.0);
    });

    it('FLEXIBLE shift without customStandardHours defaults to 8.0', () => {
      const result = ShiftService.calculateShiftHours('08:00', '12:00', 0, false, 'FLEXIBLE');
      expect(result.standardWorkHours).toBe(8.0);
    });

    it('FIXED shift uses calculated hours as standardWorkHours', () => {
      const result = ShiftService.calculateShiftHours('06:00', '14:00', 60, false, 'FIXED');
      expect(result.standardWorkHours).toBe(7.0);
    });

    it('break exceeding shift span clamps workingMinutes to 0', () => {
      const result = ShiftService.calculateShiftHours('09:00', '09:30', 60);
      expect(result.totalSpanMinutes).toBe(30);
      expect(result.workingMinutes).toBe(0);
    });

    it('midnight boundary: 00:00–08:00 is NOT overnight (endTime > startTime)', () => {
      const result = ShiftService.calculateShiftHours('00:00', '08:00', 30);
      expect(result.isOvernight).toBe(false);
      expect(result.totalSpanMinutes).toBe(480);
      expect(result.workingMinutes).toBe(450);
    });
  });

  // ── 2. ShiftService CRUD ────────────────────────────────────────────────────

  describe('2. ShiftService CRUD — Authorization & Business Rules', () => {
    describe('listShifts', () => {
      it('returns only active shifts by default', async () => {
        mockPrisma.workShift.findMany.mockResolvedValue([activeShift]);

        const result = await ShiftService.listShifts(false);

        expect(mockPrisma.workShift.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ isActive: true }) })
        );
        expect(result).toHaveLength(1);
        expect(result[0].code).toBe('CA-HANH-CHINH');
      });

      it('returns all shifts (including inactive) when includeInactive=true', async () => {
        mockPrisma.workShift.findMany.mockResolvedValue([activeShift]);
        await ShiftService.listShifts(true);
        expect(mockPrisma.workShift.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) })
        );
        // isActive filter should NOT be present
        const callArg = mockPrisma.workShift.findMany.mock.calls[0][0];
        expect(callArg.where.isActive).toBeUndefined();
      });
    });

    describe('createShift', () => {
      const createInput = {
        code: 'ca-sang',
        name: 'Ca Sáng',
        shiftType: 'FIXED' as const,
        startTime: '06:00',
        endTime: '14:00',
        breakMinutes: 60,
        isOvernight: false,
        gracePeriodLate: 10,
        gracePeriodEarly: 10,
        isActive: true,
        effectiveFrom: '2026-09-01',
      };

      it('HR can create a new shift', async () => {
        mockPrisma.workShift.findUnique.mockResolvedValue(null);
        const createdShift = {
          ...activeShift,
          id: 'shift-new',
          code: 'CA-SANG',
          name: 'Ca Sáng',
          standardWorkHours: { toNumber: () => 7 },
        };
        mockPrisma.workShift.create.mockResolvedValue(createdShift);
        mockPrisma.auditLog.create.mockResolvedValue({});

        const result = await ShiftService.createShift(createInput, hrSession);

        expect(result.code).toBe('CA-SANG');
        expect(mockPrisma.workShift.create).toHaveBeenCalledTimes(1);
      });

      it('Employee cannot create a shift → 403', async () => {
        await expect(
          ShiftService.createShift(createInput, employeeSession)
        ).rejects.toMatchObject({ statusCode: 403 });
      });

      it('Manager cannot create a shift → 403', async () => {
        await expect(
          ShiftService.createShift(createInput, managerSession)
        ).rejects.toMatchObject({ statusCode: 403 });
      });

      it('Duplicate code is rejected → 409', async () => {
        mockPrisma.workShift.findUnique.mockResolvedValue(activeShift); // code exists

        await expect(
          ShiftService.createShift(createInput, adminSession)
        ).rejects.toMatchObject({ statusCode: 409 });
      });

      it('Overnight flag is auto-set when endTime < startTime (ignores isOvernight=false input)', async () => {
        mockPrisma.workShift.findUnique.mockResolvedValue(null);
        const nightInput = { ...createInput, code: 'ca-dem-test', startTime: '22:00', endTime: '06:00', isOvernight: false };
        const createdNight = { ...overnightShift, id: 'shift-auto-night', standardWorkHours: { toNumber: () => 7.5 } };
        mockPrisma.workShift.create.mockResolvedValue(createdNight);
        mockPrisma.auditLog.create.mockResolvedValue({});

        const result = await ShiftService.createShift(nightInput, hrSession);

        expect(result.isOvernight).toBe(true);
        const createCall = mockPrisma.workShift.create.mock.calls[0][0];
        expect(createCall.data.isOvernight).toBe(true); // auto-detected
      });
    });

    describe('toggleShiftStatus', () => {
      it('HR can deactivate shift', async () => {
        mockPrisma.workShift.findUnique.mockResolvedValue(activeShift);
        const deactivated = { ...activeShift, isActive: false };
        mockPrisma.workShift.update.mockResolvedValue(deactivated);
        mockPrisma.auditLog.create.mockResolvedValue({});

        const result = await ShiftService.toggleShiftStatus('shift-001', false, hrSession);
        expect(result.isActive).toBe(false);
      });

      it('Throws 403 for employee trying to deactivate', async () => {
        await expect(
          ShiftService.toggleShiftStatus('shift-001', false, employeeSession)
        ).rejects.toMatchObject({ statusCode: 403 });
      });
    });

    describe('deleteShift (FK Integrity)', () => {
      it('Cannot delete shift that has active employee schedules → 400', async () => {
        mockPrisma.workShift.findUnique.mockResolvedValue(activeShift);
        mockPrisma.employeeSchedule.count.mockResolvedValue(5);
        mockPrisma.recurringSchedule.count.mockResolvedValue(2);

        await expect(
          ShiftService.deleteShift('shift-001', adminSession)
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it('Soft-deletes shift (sets deletedAt) when no schedules reference it', async () => {
        mockPrisma.workShift.findUnique.mockResolvedValue(activeShift);
        mockPrisma.employeeSchedule.count.mockResolvedValue(0);
        mockPrisma.recurringSchedule.count.mockResolvedValue(0);
        mockPrisma.workShift.update.mockResolvedValue({ ...activeShift, deletedAt: new Date() });
        mockPrisma.auditLog.create.mockResolvedValue({});

        const result = await ShiftService.deleteShift('shift-001', adminSession);
        expect(result.deleted).toBe(true);

        const updateCall = mockPrisma.workShift.update.mock.calls[0][0];
        expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
        expect(updateCall.data.isActive).toBe(false);
      });

      it('Employee cannot delete shift → 403', async () => {
        await expect(
          ShiftService.deleteShift('shift-001', employeeSession)
        ).rejects.toMatchObject({ statusCode: 403 });
      });
    });
  });

  // ── 3. ScheduleService ──────────────────────────────────────────────────────

  describe('3. ScheduleService — Assign, Bulk, Recurring', () => {
    beforeEach(() => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      mockPrisma.workShift.findUnique.mockResolvedValue(activeShift);
    });

    describe('assignSingleSchedule', () => {
      const singleInput = {
        employeeId: 'emp-001',
        shiftId: 'shift-001',
        workDate: '2026-09-10',
        isTemporary: false,
      };

      it('HR can assign a new schedule', async () => {
        mockPrisma.employeeSchedule.findUnique.mockResolvedValue(null);
        const created = {
          id: 'sched-001',
          employeeId: 'emp-001',
          shiftId: 'shift-001',
          workDate: new Date('2026-09-10'),
          status: 'SCHEDULED',
          isTemporary: false,
          shift: activeShift,
          employee: activeEmployee,
        };
        mockPrisma.employeeSchedule.create.mockResolvedValue(created);
        mockPrisma.auditLog.create.mockResolvedValue({});

        const result = await ScheduleService.assignSingleSchedule(singleInput, hrSession);
        expect(result.status).toBe('SCHEDULED');
        expect(mockPrisma.employeeSchedule.create).toHaveBeenCalledTimes(1);
      });

      it('Upserts schedule if same employee+date already exists', async () => {
        const existingSchedule = { id: 'sched-existing', shiftId: 'shift-old' };
        mockPrisma.employeeSchedule.findUnique.mockResolvedValue(existingSchedule);
        const updated = { ...existingSchedule, shiftId: 'shift-001', shift: activeShift, employee: activeEmployee };
        mockPrisma.employeeSchedule.update.mockResolvedValue(updated);
        mockPrisma.auditLog.create.mockResolvedValue({});

        await ScheduleService.assignSingleSchedule(singleInput, hrSession);
        expect(mockPrisma.employeeSchedule.update).toHaveBeenCalledTimes(1);
        expect(mockPrisma.employeeSchedule.create).not.toHaveBeenCalled();
      });

      it('Employee cannot assign schedules → 403', async () => {
        await expect(
          ScheduleService.assignSingleSchedule(singleInput, employeeSession)
        ).rejects.toMatchObject({ statusCode: 403 });
      });

      it('Cannot assign to TERMINATED employee → 400', async () => {
        mockPrisma.employee.findUnique.mockResolvedValue({ ...activeEmployee, status: 'TERMINATED' });
        await expect(
          ScheduleService.assignSingleSchedule(singleInput, hrSession)
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it('Cannot assign inactive shift → 400', async () => {
        mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
        mockPrisma.workShift.findUnique.mockResolvedValue({ ...activeShift, isActive: false });
        await expect(
          ScheduleService.assignSingleSchedule(singleInput, hrSession)
        ).rejects.toMatchObject({ statusCode: 400 });
      });
    });

    describe('bulkAssignSchedule', () => {
      const bulkInput = {
        employeeIds: ['emp-001', 'emp-002'],
        shiftId: 'shift-001',
        startDate: '2026-09-01',
        endDate: '2026-09-07',
        daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
        isTemporary: false,
      };

      it('Admin can bulk assign schedules for multiple employees', async () => {
        mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
        mockPrisma.workShift.findUnique.mockResolvedValue(activeShift);
        mockPrisma.employeeSchedule.findUnique.mockResolvedValue(null);
        mockPrisma.employeeSchedule.create.mockResolvedValue({ id: 'sched-bulk' });
        mockPrisma.auditLog.create.mockResolvedValue({});

        const result = await ScheduleService.bulkAssignSchedule(bulkInput, adminSession);

        // 2026-09-01 to 2026-09-07 has Mon(1)-Fri(5) = 5 working days
        // 2 employees × 5 days = 10 creates
        expect(result.totalDates).toBe(5);
        expect(result.created).toBe(10);
        expect(result.updated).toBe(0);
      });

      it('Returns 400 if no dates match selected days of week', async () => {
        // 2026-09-02 (Wed) to 2026-09-02 (Wed) — only one day, and we look for weekends only
        const satSunOnly = {
          ...bulkInput,
          startDate: '2026-09-02', // Wednesday
          endDate: '2026-09-02',   // Same day — Wednesday
          daysOfWeek: [0, 6],      // Only Sun(0) and Sat(6) — no match in a single Wednesday
        };

        await expect(
          ScheduleService.bulkAssignSchedule(satSunOnly, adminSession)
        ).rejects.toMatchObject({ statusCode: 400 });
      });
    });

    describe('assignRecurringPattern', () => {
      const recurringInput = {
        employeeId: 'emp-001',
        shiftId: 'shift-001',
        daysOfWeek: [1, 2, 3, 4, 5],
        effectiveFrom: '2026-09-01',
      };

      it('HR can assign a recurring schedule pattern', async () => {
        mockPrisma.recurringSchedule.updateMany.mockResolvedValue({ count: 0 });
        const createdPattern = {
          id: 'rec-001',
          employeeId: 'emp-001',
          shiftId: 'shift-001',
          dayOfWeek: 1,
          effectiveFrom: new Date('2026-09-01'),
          effectiveTo: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockPrisma.recurringSchedule.create.mockResolvedValue(createdPattern);
        mockPrisma.auditLog.create.mockResolvedValue({});

        const result = await ScheduleService.assignRecurringPattern(recurringInput, hrSession);

        // Should create one pattern row per day of week
        expect(result).toHaveLength(5);
        expect(mockPrisma.recurringSchedule.create).toHaveBeenCalledTimes(5);
      });

      it('Deactivates old overlapping patterns before creating new ones', async () => {
        mockPrisma.recurringSchedule.updateMany.mockResolvedValue({ count: 2 });
        mockPrisma.recurringSchedule.create.mockResolvedValue({ id: 'rec-new', dayOfWeek: 1 });
        mockPrisma.auditLog.create.mockResolvedValue({});

        await ScheduleService.assignRecurringPattern(recurringInput, hrSession);

        expect(mockPrisma.recurringSchedule.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              employeeId: 'emp-001',
              isActive: true,
            }),
            data: expect.objectContaining({ isActive: false }),
          })
        );
      });

      it('Employee cannot assign recurring patterns → 403', async () => {
        await expect(
          ScheduleService.assignRecurringPattern(recurringInput, employeeSession)
        ).rejects.toMatchObject({ statusCode: 403 });
      });
    });
  });

  // ── 4. Effective Date & Shift Lifecycle ─────────────────────────────────────

  describe('4. Effective Dates & Shift Lifecycle', () => {
    it('calculates effectiveTo correctly from input date string', async () => {
      mockPrisma.workShift.findUnique.mockResolvedValue(null);
      const created = {
        ...activeShift,
        id: 'shift-eff',
        code: 'CA-EFF',
        effectiveTo: new Date('2026-12-31'),
        standardWorkHours: { toNumber: () => 8.5 },
      };
      mockPrisma.workShift.create.mockResolvedValue(created);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await ShiftService.createShift(
        {
          code: 'ca-eff',
          name: 'Ca Có Ngày Hết Hiệu Lực',
          shiftType: 'FIXED',
          startTime: '08:00',
          endTime: '17:30',
          breakMinutes: 60,
          isOvernight: false,
          gracePeriodLate: 15,
          gracePeriodEarly: 15,
          isActive: true,
          effectiveFrom: '2026-09-01',
          effectiveTo: '2026-12-31',
        },
        adminSession
      );

      expect(result.effectiveTo).toBe('2026-12-31');
    });

    it('getShiftById throws 404 for soft-deleted shift', async () => {
      mockPrisma.workShift.findUnique.mockResolvedValue({ ...activeShift, deletedAt: new Date() });

      await expect(ShiftService.getShiftById('shift-deleted')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ── 5. querySchedules — Employee Self-Service Access Control ─────────────────

  describe('5. querySchedules — Role-Based Access Control', () => {
    const scheduleRecord = {
      id: 'sched-001',
      employeeId: 'emp-001',
      shiftId: 'shift-001',
      workDate: new Date('2026-09-10'),
      status: 'SCHEDULED',
      isTemporary: false,
      employee: { id: 'emp-001', code: 'EMP-001', fullName: 'Nguyễn Văn A', department: { id: 'dept-1', name: 'IT' } },
      shift: { ...activeShift, standardWorkHours: { toNumber: () => 8.5 } },
    };

    it('Employee can only see their own schedule (scoped by userId→employeeId)', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-001' });
      mockPrisma.employeeSchedule.findMany.mockResolvedValue([scheduleRecord]);

      await ScheduleService.querySchedules({ status: 'ALL' }, employeeSession);

      expect(mockPrisma.employeeSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employeeId: 'emp-001' }),
        })
      );
    });

    it('HR can query all schedules without restriction', async () => {
      mockPrisma.employeeSchedule.findMany.mockResolvedValue([scheduleRecord]);

      await ScheduleService.querySchedules({ employeeId: 'emp-002', status: 'ALL' }, hrSession);

      // For HR, employeeId filter comes from params, not forced
      expect(mockPrisma.employeeSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employeeId: 'emp-002' }),
        })
      );
    });

    it('querySchedules filters by date range', async () => {
      mockPrisma.employeeSchedule.findMany.mockResolvedValue([]);

      await ScheduleService.querySchedules(
        { startDate: '2026-09-01', endDate: '2026-09-30', status: 'ALL' },
        hrSession
      );

      const callArg = mockPrisma.employeeSchedule.findMany.mock.calls[0][0];
      expect(callArg.where.workDate).toMatchObject({
        gte: new Date('2026-09-01'),
        lte: new Date('2026-09-30'),
      });
    });

    it('querySchedules filters by status', async () => {
      mockPrisma.employeeSchedule.findMany.mockResolvedValue([]);

      await ScheduleService.querySchedules({ status: 'ABSENT' as const }, hrSession);

      const callArg = mockPrisma.employeeSchedule.findMany.mock.calls[0][0];
      expect(callArg.where.status).toBe('ABSENT');
    });
  });
});
