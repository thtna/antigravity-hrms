/**
 * PHASE 6 — BASIC ATTENDANCE ENGINE TEST SUITE
 *
 * Tests:
 * 1. Working Hours Calculation (Pure Logic)
 *    - Normal shift on-time (8h with 60m break)
 *    - Late arrival (after grace period)
 *    - Arrival within grace period (no penalty)
 *    - Early leave (before grace period)
 *    - Departure within grace period (no penalty)
 *    - Both late AND early leave
 *    - Overtime (OT) detection
 *    - Overnight shift spanning midnight (22:00 -> 06:00)
 *    - Reject checkout time before or equal to check-in
 * 2. Check-In Security & Business Rules
 *    - Successful check-in (IN_PROGRESS)
 *    - Prevent duplicate check-in on the same date (409 Conflict)
 *    - Prevent future timestamps (> 5 min clock drift)
 * 3. Check-Out Security & Business Rules
 *    - Successful check-out with schedule status COMPLETED
 *    - Prevent check-out without a check-in record (no record found)
 *    - Prevent duplicate check-out (already has checkOutTime)
 *    - Prevent checkout time earlier than checkin time
 * 4. Authorization & RBAC Scoping
 *    - Employee scoped to own attendance in queryAttendance
 *    - HR can query all employees without constraint
 *    - Employee blocked from manualLogAttendance
 *    - Admin can successfully log attendance manually
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Use vi.hoisted so mockPrisma is available BEFORE vi.mock factories run ──
const mockPrisma = vi.hoisted(() => ({
  attendance: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
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
    findFirst: vi.fn(),
  },
  workShift: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
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

import { AttendanceService } from '@/lib/services/attendance.service';

// ── Fixture sessions ─────────────────────────────────────────────────────────

const adminSession = {
  userId: 'usr-admin',
  roles: ['admin' as const],
  email: 'admin@test.com',
  fullName: 'Admin User',
  permissions: [],
  isActive: true,
};

const hrSession = {
  userId: 'usr-hr',
  roles: ['hr' as const],
  email: 'hr@test.com',
  fullName: 'HR User',
  permissions: [],
  isActive: true,
};

const employeeSession = {
  userId: 'usr-emp',
  roles: ['employee' as const],
  email: 'emp@test.com',
  fullName: 'Employee User',
  permissions: [],
  isActive: true,
};

// ── Test date: yesterday (clearly in the past) ────────────────────────────────
// Current time is 2026-09-04 so 2026-09-03 is safely in the past for all guards.
const PAST_DATE = '2026-09-03';

// ── Fixture shifts ────────────────────────────────────────────────────────────

const standardShift = {
  id: 'shift-std',
  code: 'STD',
  name: 'Ca Hành Chính',
  startTime: '08:30',
  endTime: '17:30',
  breakMinutes: 60,
  gracePeriodLate: 15,
  gracePeriodEarly: 15,
  isOvernight: false,
  standardWorkHours: 8.0,
  isActive: true,
  deletedAt: null,
};

const overnightShift = {
  id: 'shift-night',
  code: 'NIGHT',
  name: 'Ca Đêm',
  startTime: '22:00',
  endTime: '06:00',
  breakMinutes: 30,
  gracePeriodLate: 10,
  gracePeriodEarly: 10,
  isOvernight: true,
  standardWorkHours: 7.5,
  isActive: true,
  deletedAt: null,
};

const activeEmployee = {
  id: 'emp-001',
  employeeCode: 'EMP-001',
  firstName: 'Văn A',
  lastName: 'Nguyễn',
  status: 'ACTIVE',
  deletedAt: null,
};

// ── TEST SUITE ───────────────────────────────────────────────────────────────

describe('PHASE 6 — ATTENDANCE ENGINE TEST SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  // ===========================================================================
  // 1. WORKING HOURS CALCULATION (PURE LOGIC)
  // ===========================================================================
  describe('1. Working Hours Calculation (Pure Logic)', () => {
    it('calculates on-time attendance correctly (08:30 - 17:30 with 60m break = 8h)', () => {
      const checkIn  = new Date(`${PAST_DATE}T08:30:00`);
      const checkOut = new Date(`${PAST_DATE}T17:30:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.totalSpanMinutes).toBe(540); // 9h raw span
      expect(metrics.workingMinutes).toBe(480);   // 9h - 60m break
      expect(metrics.actualWorkHours).toBe(8.0);
      expect(metrics.lateMinutes).toBe(0);
      expect(metrics.earlyMinutes).toBe(0);
      expect(metrics.otHours).toBe(0);
      expect(metrics.status).toBe('ON_TIME');
    });

    it('detects late arrival exceeding grace period (08:50 vs 08:30 + 15m grace → 20m late)', () => {
      const checkIn  = new Date(`${PAST_DATE}T08:50:00`);
      const checkOut = new Date(`${PAST_DATE}T17:30:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.lateMinutes).toBe(20);
      expect(metrics.earlyMinutes).toBe(0);
      expect(metrics.status).toBe('LATE');
    });

    it('allows arrival within grace period without late penalty (08:40 = 10m late ≤ 15m grace)', () => {
      const checkIn  = new Date(`${PAST_DATE}T08:40:00`);
      const checkOut = new Date(`${PAST_DATE}T17:30:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.lateMinutes).toBe(0);
      expect(metrics.status).toBe('ON_TIME');
    });

    it('detects early leave exceeding grace period (16:30 vs 17:30 - 15m grace → 60m early)', () => {
      const checkIn  = new Date(`${PAST_DATE}T08:30:00`);
      const checkOut = new Date(`${PAST_DATE}T16:30:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.earlyMinutes).toBe(60);
      expect(metrics.status).toBe('EARLY_LEAVE');
    });

    it('allows departure within grace period without early penalty (17:20 = 10m early ≤ 15m grace)', () => {
      const checkIn  = new Date(`${PAST_DATE}T08:30:00`);
      const checkOut = new Date(`${PAST_DATE}T17:20:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.earlyMinutes).toBe(0);
      expect(metrics.status).toBe('ON_TIME');
    });

    it('marks status LATE_AND_EARLY when both conditions are violated (09:00 - 16:00)', () => {
      const checkIn  = new Date(`${PAST_DATE}T09:00:00`);
      const checkOut = new Date(`${PAST_DATE}T16:00:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.lateMinutes).toBe(30);   // 09:00 - 08:30 = 30m
      expect(metrics.earlyMinutes).toBe(90);  // 17:30 - 16:00 = 90m
      expect(metrics.status).toBe('LATE_AND_EARLY');
    });

    it('detects overtime: 08:00 - 19:30 with 60m break = 10.5h work > 8h standard → 2.5h OT', () => {
      const checkIn  = new Date(`${PAST_DATE}T08:00:00`);
      const checkOut = new Date(`${PAST_DATE}T19:30:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.actualWorkHours).toBe(10.5);
      expect(metrics.otHours).toBe(2.5);
      expect(metrics.status).toBe('OVERTIME');
    });

    it('calculates overnight shift spanning midnight correctly (22:00 → 06:00 next day = 7.5h)', () => {
      // Night shift: starts 2026-09-03 22:00, ends 2026-09-04 06:00
      const checkIn  = new Date('2026-09-03T22:00:00');
      const checkOut = new Date('2026-09-04T06:00:00');

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, overnightShift);

      expect(metrics.totalSpanMinutes).toBe(480);  // 8h raw
      expect(metrics.workingMinutes).toBe(450);    // 480 - 30m break
      expect(metrics.actualWorkHours).toBe(7.5);
      expect(metrics.lateMinutes).toBe(0);
      expect(metrics.earlyMinutes).toBe(0);
      expect(metrics.status).toBe('ON_TIME');
    });

    it('throws when checkOut is before checkIn (time-travel check)', () => {
      const checkIn  = new Date(`${PAST_DATE}T17:30:00`);
      const checkOut = new Date(`${PAST_DATE}T08:30:00`);

      expect(() =>
        AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift)
      ).toThrowError('Thời gian check-out phải lớn hơn thời gian check-in.');
    });
  });

  // ===========================================================================
  // 2. CHECK-IN SECURITY & BUSINESS RULES
  // ===========================================================================
  describe('2. Check-In Security & Business Rules', () => {
    it('creates attendance record with IN_PROGRESS status on valid check-in', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      mockPrisma.attendance.findUnique.mockResolvedValue(null); // no existing record

      // Provide a past shift schedule
      mockPrisma.employeeSchedule.findUnique.mockResolvedValue({
        id: 'sch-001',
        shift: standardShift,
      });

      const pastCheckIn = new Date(`${PAST_DATE}T08:30:00`);

      mockPrisma.attendance.create.mockResolvedValue({
        id: 'att-001',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        checkInTime: pastCheckIn,
        checkOutTime: null,
        status: 'IN_PROGRESS',
        actualWorkHours: 0,
        otHours: 0,
        lateMinutes: 0,
        shift: standardShift,
        schedule: null,
        employee: activeEmployee,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await AttendanceService.checkIn(
        {
          workDate: PAST_DATE,
          checkInTime: pastCheckIn.toISOString(),
          checkInMethod: 'WEB' as const,
        },
        employeeSession
      );

      expect(mockPrisma.attendance.create).toHaveBeenCalled();
      expect(result.status).toBe('IN_PROGRESS');
    });

    it('PREVENTS duplicate check-in on the same date for the same employee', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      // Return existing attendance — means employee already checked in
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-existing',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        checkInTime: new Date(`${PAST_DATE}T08:25:00`),
      });

      await expect(
        AttendanceService.checkIn(
          {
            workDate: PAST_DATE,
            checkInTime: `${PAST_DATE}T08:35:00`,
            checkInMethod: 'WEB' as const,
          },
          employeeSession
        )
      ).rejects.toThrowError(new RegExp(`Nhân viên đã thực hiện check-in cho ngày ${PAST_DATE}`));
    });

    it('PREVENTS check-in with future timestamp (> 5m clock drift)', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // +2h

      await expect(
        AttendanceService.checkIn({ checkInTime: futureTime, checkInMethod: 'WEB' as const }, employeeSession)
      ).rejects.toThrowError('Thời gian check-in không được ở tương lai.');
    });
  });

  // ===========================================================================
  // 3. CHECK-OUT SECURITY & BUSINESS RULES
  // ===========================================================================
  describe('3. Check-Out Security & Business Rules', () => {
    it('successfully checks out, updates attendance metrics and marks schedule COMPLETED', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const pastCheckIn  = new Date(`${PAST_DATE}T08:30:00`);
      const pastCheckOut = new Date(`${PAST_DATE}T17:30:00`);

      // Existing attendance (checked in, not yet out)
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-001',
        employeeId: 'emp-001',
        scheduleId: 'sch-001',
        workDate: new Date(PAST_DATE),
        checkInTime: pastCheckIn,
        checkOutTime: null,
        schedule: {
          id: 'sch-001',
          shift: standardShift,
        },
      });

      mockPrisma.attendance.update.mockResolvedValue({
        id: 'att-001',
        workDate: new Date(PAST_DATE),
        checkInTime: pastCheckIn,
        checkOutTime: pastCheckOut,
        actualWorkHours: 8.0,
        lateMinutes: 0,
        earlyMinutes: 0,
        otHours: 0,
        status: 'ON_TIME',
        shift: standardShift,
        employee: activeEmployee,
      });
      mockPrisma.employeeSchedule.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await AttendanceService.checkOut(
        {
          workDate: PAST_DATE,
          checkOutTime: pastCheckOut.toISOString(),
          checkOutMethod: 'WEB' as const,
        },
        employeeSession
      );

      expect(mockPrisma.attendance.update).toHaveBeenCalled();
      // Schedule marked COMPLETED
      expect(mockPrisma.employeeSchedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sch-001' },
          data: { status: 'COMPLETED' },
        })
      );
      expect(result.actualWorkHours).toBe(8.0);
      expect(result.status).toBe('ON_TIME');
    });

    it('PREVENTS check-out when no check-in record exists for the day', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      mockPrisma.attendance.findUnique.mockResolvedValue(null); // no record

      await expect(
        AttendanceService.checkOut(
          {
            workDate: PAST_DATE,
            checkOutTime: `${PAST_DATE}T17:30:00`,
            checkOutMethod: 'WEB' as const,
          },
          employeeSession
        )
      ).rejects.toThrowError(
        'Không tìm thấy bản ghi check-in cho ngày làm việc này. Bạn phải thực hiện Check-in trước khi Check-out.'
      );
    });

    it('PREVENTS duplicate check-out when record already has checkOutTime', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-done',
        employeeId: 'emp-001',
        checkInTime: new Date(`${PAST_DATE}T08:30:00`),
        checkOutTime: new Date(`${PAST_DATE}T17:30:00`), // already checked out!
      });

      await expect(
        AttendanceService.checkOut(
          {
            workDate: PAST_DATE,
            checkOutTime: `${PAST_DATE}T18:00:00`,
            checkOutMethod: 'WEB' as const,
          },
          employeeSession
        )
      ).rejects.toThrowError(/Bản ghi đã được check-out/);
    });

    it('PREVENTS check-out time earlier than check-in time', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-001',
        employeeId: 'emp-001',
        checkInTime: new Date(`${PAST_DATE}T12:00:00`),
        checkOutTime: null,
      });

      await expect(
        AttendanceService.checkOut(
          {
            workDate: PAST_DATE,
            checkOutTime: `${PAST_DATE}T09:00:00`, // 09:00 before check-in at 12:00
            checkOutMethod: 'WEB' as const,
          },
          employeeSession
        )
      ).rejects.toThrowError(/Thời gian check-out .* phải diễn ra sau thời gian check-in/);
    });
  });

  // ===========================================================================
  // 4. AUTHORIZATION & SCOPING (RBAC)
  // ===========================================================================
  describe('4. Authorization & Scoping (RBAC)', () => {
    it('Employee is scoped to only their own attendance in queryAttendance', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-001' });
      mockPrisma.attendance.count.mockResolvedValue(1);
      mockPrisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-001',
          employeeId: 'emp-001',
          workDate: new Date(PAST_DATE),
          actualWorkHours: 8,
          otHours: 0,
          status: 'ON_TIME',
        },
      ]);

      await AttendanceService.queryAttendance(
        { status: 'ALL', page: 1, limit: 10 },
        employeeSession
      );

      const findManyCall = mockPrisma.attendance.findMany.mock.calls[0][0];
      expect(findManyCall.where.employeeId).toBe('emp-001');
    });

    it('HR can query attendance across all employees (no employeeId constraint)', async () => {
      mockPrisma.attendance.count.mockResolvedValue(0);
      mockPrisma.attendance.findMany.mockResolvedValue([]);

      await AttendanceService.queryAttendance(
        { status: 'ALL', page: 1, limit: 10 },
        hrSession
      );

      const findManyCall = mockPrisma.attendance.findMany.mock.calls[0][0];
      expect(findManyCall.where.employeeId).toBeUndefined();
    });

    it('Employee is BLOCKED from manualLogAttendance (forbidden)', async () => {
      await expect(
        AttendanceService.manualLogAttendance(
          {
            employeeId: 'emp-002',
            workDate: PAST_DATE,
            checkInTime: '08:30',
            checkOutTime: '17:30',
          },
          employeeSession
        )
      ).rejects.toThrowError('Chỉ Quản trị viên hoặc Nhân sự mới có quyền ghi nhận công thủ công.');
    });

    it('Admin can successfully manual log attendance for an employee', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-002',
        status: 'ACTIVE',
        deletedAt: null,
      });

      // resolveShiftForDate path 1: direct EmployeeSchedule
      mockPrisma.employeeSchedule.findUnique.mockResolvedValue({
        id: 'sch-002',
        shift: standardShift,
      });

      // recurringSchedule not used (path 1 resolves first)
      mockPrisma.recurringSchedule.findFirst.mockResolvedValue(null);

      mockPrisma.attendance.upsert.mockResolvedValue({
        id: 'att-manual-001',
        employeeId: 'emp-002',
        workDate: new Date(PAST_DATE),
        checkInTime: new Date(`${PAST_DATE}T08:30:00`),
        checkOutTime: new Date(`${PAST_DATE}T17:30:00`),
        actualWorkHours: 8.0,
        lateMinutes: 0,
        earlyMinutes: 0,
        otHours: 0,
        status: 'ON_TIME',
        employee: {
          id: 'emp-002',
          employeeCode: 'EMP-002',
          firstName: 'Văn B',
          lastName: 'Trần',
          avatarUrl: null,
          department: { id: 'dept-1', name: 'IT', code: 'IT' },
          position: { id: 'pos-1', title: 'Dev', code: 'DEV' },
        },
        schedule: {
          id: 'sch-002',
          shift: standardShift,
        },
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await AttendanceService.manualLogAttendance(
        {
          employeeId: 'emp-002',
          workDate: PAST_DATE,
          checkInTime: '08:30',
          checkOutTime: '17:30',
          notes: 'Đi công tác về, ghi nhận công bù',
        },
        adminSession
      );

      expect(mockPrisma.attendance.upsert).toHaveBeenCalled();
      expect(result.actualWorkHours).toBe(8.0);
    });
  });
});
