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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma, type Attendance } from '@prisma/client';

// ── Use vi.hoisted so mockPrisma is available BEFORE vi.mock factories run ──
const mockPrisma = vi.hoisted(() => ({
  attendance: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
  },
  employeeSchedule: {
    findFirst: vi.fn(),
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
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  attendanceAdjustment: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));

const mockTx = vi.hoisted(() => ({
  attendance: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  employeeSchedule: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  recurringSchedule: {
    findFirst: vi.fn(),
  },
  workShift: {
    findFirst: vi.fn(),
  },
  employee: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  AttendanceService, RECONCILIATION_ABSENT_ACTION, RECONCILIATION_ABSENT_NOTES,
} from '@/lib/services/attendance.service';

// ── Fixture sessions ─────────────────────────────────────────────────────────

const adminSession = {
  userId: 'usr-admin',
  organizationId: 'org-001',
  roles: ['admin' as const],
  email: 'admin@test.com',
  fullName: 'Admin User',
  permissions: [],
  isActive: true,
};

const hrSession = {
  userId: 'usr-hr',
  organizationId: 'org-001',
  roles: ['hr' as const],
  email: 'hr@test.com',
  fullName: 'HR User',
  permissions: [],
  isActive: true,
};

const employeeSession = {
  userId: 'usr-emp',
  organizationId: 'org-001',
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
  organizationId: 'org-001',
  employeeCode: 'EMP-001',
  firstName: 'Văn A',
  lastName: 'Nguyễn',
  status: 'ACTIVE',
  deletedAt: null,
};

// ── TEST SUITE ───────────────────────────────────────────────────────────────

describe('PHASE 6 — ATTENDANCE ENGINE TEST SUITE', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  // ===========================================================================
  // 1. WORKING HOURS CALCULATION (PURE LOGIC)
  // ===========================================================================
  describe('1. Working Hours Calculation (Pure Logic)', () => {
    it('calculates on-time attendance correctly (08:30 - 17:30 with 60m break = 8h)', () => {
      const checkIn  = new Date(`${PAST_DATE}T08:30:00+07:00`);
      const checkOut = new Date(`${PAST_DATE}T17:30:00+07:00`);

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
      const checkIn  = new Date(`${PAST_DATE}T08:50:00+07:00`);
      const checkOut = new Date(`${PAST_DATE}T17:30:00+07:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.lateMinutes).toBe(20);
      expect(metrics.earlyMinutes).toBe(0);
      expect(metrics.status).toBe('LATE');
    });

    it('allows arrival within grace period without late penalty (08:40 = 10m late ≤ 15m grace)', () => {
      const checkIn  = new Date(`${PAST_DATE}T08:40:00+07:00`);
      const checkOut = new Date(`${PAST_DATE}T17:30:00+07:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.lateMinutes).toBe(0);
      expect(metrics.status).toBe('ON_TIME');
    });

    it('detects early leave exceeding grace period (16:30 vs 17:30 - 15m grace → 60m early)', () => {
      const checkIn  = new Date(`${PAST_DATE}T08:30:00+07:00`);
      const checkOut = new Date(`${PAST_DATE}T16:30:00+07:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.earlyMinutes).toBe(60);
      expect(metrics.status).toBe('EARLY_LEAVE');
    });

    it('allows departure within grace period without early penalty (17:20 = 10m early ≤ 15m grace)', () => {
      const checkIn  = new Date(`${PAST_DATE}T08:30:00+07:00`);
      const checkOut = new Date(`${PAST_DATE}T17:20:00+07:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.earlyMinutes).toBe(0);
      expect(metrics.status).toBe('ON_TIME');
    });

    it('marks status LATE_AND_EARLY when both conditions are violated (09:00 - 16:00)', () => {
      const checkIn  = new Date(`${PAST_DATE}T09:00:00+07:00`);
      const checkOut = new Date(`${PAST_DATE}T16:00:00+07:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.lateMinutes).toBe(30);   // 09:00 - 08:30 = 30m
      expect(metrics.earlyMinutes).toBe(90);  // 17:30 - 16:00 = 90m
      expect(metrics.status).toBe('LATE_AND_EARLY');
    });

    it('detects overtime: 08:00 - 19:30 with 60m break = 10.5h work > 8h standard → 2.5h OT', () => {
      const checkIn  = new Date(`${PAST_DATE}T08:00:00+07:00`);
      const checkOut = new Date(`${PAST_DATE}T19:30:00+07:00`);

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, standardShift);

      expect(metrics.actualWorkHours).toBe(10.5);
      expect(metrics.otHours).toBe(2.5);
      expect(metrics.status).toBe('OVERTIME');
    });

    it('calculates overnight shift spanning midnight correctly (22:00 → 06:00 next day = 7.5h)', () => {
      // Night shift: starts 2026-09-03 22:00, ends 2026-09-04 06:00
      const checkIn  = new Date('2026-09-03T22:00:00+07:00');
      const checkOut = new Date('2026-09-04T06:00:00+07:00');

      const metrics = AttendanceService.calculateAttendanceMetrics(checkIn, checkOut, overnightShift);

      expect(metrics.totalSpanMinutes).toBe(480);  // 8h raw
      expect(metrics.workingMinutes).toBe(450);    // 480 - 30m break
      expect(metrics.actualWorkHours).toBe(7.5);
      expect(metrics.lateMinutes).toBe(0);
      expect(metrics.earlyMinutes).toBe(0);
      expect(metrics.status).toBe('ON_TIME');
    });

    it('uses Vietnam shift instants independent of the host timezone', () => {
      const metrics = AttendanceService.calculateAttendanceMetrics(
        new Date('2026-09-03T01:30:00.000Z'),
        new Date('2026-09-03T10:30:00.000Z'),
        standardShift,
        '2026-09-03'
      );

      expect(metrics.lateMinutes).toBe(0);
      expect(metrics.earlyMinutes).toBe(0);
      expect(metrics.actualWorkHours).toBe(8);
    });

    it('uses the next Vietnam business date for an overnight shift end', () => {
      const metrics = AttendanceService.calculateAttendanceMetrics(
        new Date('2026-09-03T15:00:00.000Z'),
        new Date('2026-09-03T23:00:00.000Z'),
        overnightShift,
        '2026-09-03'
      );

      expect(metrics.lateMinutes).toBe(0);
      expect(metrics.earlyMinutes).toBe(0);
      expect(metrics.actualWorkHours).toBe(7.5);
    });

    it('parses manual wall-clock values as Vietnam time and advances overnight checkout', () => {
      expect(
        AttendanceService.parseAttendanceDateTime('08:30', '2026-09-03', standardShift, 'CHECK_IN').toISOString()
      ).toBe('2026-09-03T01:30:00.000Z');
      expect(
        AttendanceService.parseAttendanceDateTime('02:00', '2026-09-03', overnightShift, 'CHECK_OUT').toISOString()
      ).toBe('2026-09-03T19:00:00.000Z');
      expect(
        AttendanceService.parseAttendanceDateTime('2026-09-03T08:30:00Z', '2026-09-03', standardShift, 'CHECK_IN').toISOString()
      ).toBe('2026-09-03T08:30:00.000Z');
    });

    it('throws when checkOut is before checkIn (time-travel check)', () => {
      const checkIn  = new Date(`${PAST_DATE}T17:30:00+07:00`);
      const checkOut = new Date(`${PAST_DATE}T08:30:00+07:00`);

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

      const pastCheckIn = new Date(`${PAST_DATE}T08:30:00+07:00`);

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
        checkInTime: new Date(`${PAST_DATE}T08:25:00+07:00`),
      });

      await expect(
        AttendanceService.checkIn(
          {
            workDate: PAST_DATE,
            checkInTime: `${PAST_DATE}T08:35:00`,
          },
          employeeSession
        )
      ).rejects.toThrowError(new RegExp(`Nhân viên đã thực hiện check-in cho ngày ${PAST_DATE}`));
    });

    it('PREVENTS check-in with future timestamp (> 5m clock drift)', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // +2h

      await expect(
        AttendanceService.checkIn({ checkInTime: futureTime }, employeeSession)
      ).rejects.toThrowError('Thời gian check-in không được ở tương lai.');
    });

    it.each(['QR', 'GPS', 'MANUAL', 'BIOMETRIC'] as const)(
      'ignores untrusted client check-in provenance %s and persists WEB',
      async (checkInMethod) => {
        mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
        mockPrisma.attendance.findUnique.mockResolvedValue(null);
        mockPrisma.employeeSchedule.findUnique.mockResolvedValue({
          id: 'sch-001',
          shift: standardShift,
        });
        mockPrisma.attendance.create.mockResolvedValue({
          id: 'att-spoof-in',
          employeeId: activeEmployee.id,
          workDate: new Date(PAST_DATE),
          checkInTime: new Date(`${PAST_DATE}T08:30:00+07:00`),
          actualWorkHours: 0,
          otHours: 0,
        });

        await AttendanceService.checkIn(
          {
            workDate: PAST_DATE,
            checkInTime: `${PAST_DATE}T08:30:00+07:00`,
            checkInMethod,
          } as any,
          employeeSession
        );

        expect(mockPrisma.attendance.create.mock.calls[0][0].data.checkInMethod).toBe('WEB');
      }
    );
  });

  // ===========================================================================
  // 3. CHECK-OUT SECURITY & BUSINESS RULES
  // ===========================================================================
  describe('3. Check-Out Security & Business Rules', () => {
    const pastCheckIn = new Date(`${PAST_DATE}T08:30:00+07:00`);
    const pastCheckOut = new Date(`${PAST_DATE}T17:30:00+07:00`);

    const employeeFor = (id: string, userId: string) => ({
      ...activeEmployee,
      id,
      userId,
      organizationId: 'org-001',
    });

    const openAttendanceFor = (employeeId: string, id = 'att-001') => ({
      id,
      organizationId: 'org-001',
      employeeId,
      scheduleId: 'sch-001',
      workDate: new Date(PAST_DATE),
      checkInTime: pastCheckIn,
      checkOutTime: null,
      notes: null,
      schedule: { id: 'sch-001', shift: standardShift },
      employee: activeEmployee,
    });

    const completedAttendanceFor = (employeeId: string, id = 'att-001') => ({
      ...openAttendanceFor(employeeId, id),
      checkOutTime: pastCheckOut,
      actualWorkHours: 8.0,
      lateMinutes: 0,
      earlyMinutes: 0,
      otHours: 0,
      status: 'ON_TIME',
    });

    const arrangeSuccessfulCheckout = (employeeId = 'emp-001', attendanceId = 'att-001') => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor(employeeId, employeeSession.userId));
      mockPrisma.attendance.findFirst
        .mockResolvedValueOnce(openAttendanceFor(employeeId, attendanceId))
        .mockResolvedValueOnce(completedAttendanceFor(employeeId, attendanceId));
      mockPrisma.attendance.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.employeeSchedule.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
    };

    it('allows employee self checkout by date and keeps all writes in the transaction client', async () => {
      arrangeSuccessfulCheckout();

      const result = await AttendanceService.checkOut(
        { workDate: PAST_DATE, checkOutTime: pastCheckOut.toISOString() },
        employeeSession
      );

      expect(mockPrisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'usr-emp', organizationId: 'org-001' } })
      );
      expect(mockPrisma.attendance.findFirst.mock.calls[0][0].where).toEqual({
        organizationId: 'org-001',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
      });
      expect(mockPrisma.attendance.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'att-001',
            organizationId: 'org-001',
            employeeId: 'emp-001',
            checkOutTime: null,
          },
        })
      );
      expect(mockPrisma.employeeSchedule.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(result.actualWorkHours).toBe(8.0);
    });

    it('allows employee checkout by a self-owned attendanceId', async () => {
      arrangeSuccessfulCheckout('emp-001', 'att-owned');

      await AttendanceService.checkOut(
        { attendanceId: 'att-owned', checkOutTime: pastCheckOut.toISOString() },
        employeeSession
      );

      expect(mockPrisma.attendance.findFirst.mock.calls[0][0].where).toEqual({
        id: 'att-owned',
        organizationId: 'org-001',
        employeeId: 'emp-001',
      });
    });

    it('denies another employee attendanceId in the same tenant', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor('emp-001', 'usr-emp'));
      mockPrisma.attendance.findFirst.mockResolvedValue(null);

      await expect(
        AttendanceService.checkOut(
          { attendanceId: 'att-employee-002', checkOutTime: pastCheckOut.toISOString() },
          employeeSession
        )
      ).rejects.toThrowError('Khong tim thay ban ghi cham cong hop le de check-out.');

      expect(mockPrisma.attendance.findFirst.mock.calls[0][0].where).toEqual({
        id: 'att-employee-002',
        organizationId: 'org-001',
        employeeId: 'emp-001',
      });
      expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
    });

    it('denies a cross-tenant attendanceId without disclosing its existence', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor('emp-001', 'usr-emp'));
      mockPrisma.attendance.findFirst.mockResolvedValue(null);

      await expect(
        AttendanceService.checkOut(
          { attendanceId: 'att-tenant-b', checkOutTime: pastCheckOut.toISOString() },
          employeeSession
        )
      ).rejects.toThrowError('Khong tim thay ban ghi cham cong hop le de check-out.');

      expect(mockPrisma.attendance.findFirst.mock.calls[0][0].where.organizationId).toBe('org-001');
      expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
    });

    it('denies an explicit foreign employeeId from an employee session', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor('emp-001', 'usr-emp'));

      await expect(
        AttendanceService.checkOut(
          { employeeId: 'emp-002', workDate: PAST_DATE, checkOutTime: pastCheckOut.toISOString() },
          employeeSession
        )
      ).rejects.toThrowError('Ban khong co quyen cham cong cho nhan vien khac.');

      expect(mockPrisma.attendance.findFirst).not.toHaveBeenCalled();
    });

    it.each([
      ['admin', adminSession, 'emp-admin'],
      ['hr', hrSession, 'emp-hr'],
    ])('allows %s to checkout their own attendance without employeeId', async (_role, session, employeeId) => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor(employeeId, session.userId));
      mockPrisma.attendance.findFirst
        .mockResolvedValueOnce(openAttendanceFor(employeeId))
        .mockResolvedValueOnce(completedAttendanceFor(employeeId));
      mockPrisma.attendance.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.employeeSchedule.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      await AttendanceService.checkOut(
        { workDate: PAST_DATE, checkOutTime: pastCheckOut.toISOString() },
        session
      );

      expect(mockPrisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: session.userId, organizationId: 'org-001' } })
      );
    });

    it.each([
      ['admin', adminSession],
      ['hr', hrSession],
    ])('allows %s an explicit same-tenant employee checkout', async (_role, session) => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor('emp-002', 'usr-002'));
      mockPrisma.attendance.findFirst
        .mockResolvedValueOnce(openAttendanceFor('emp-002', 'att-002'))
        .mockResolvedValueOnce(completedAttendanceFor('emp-002', 'att-002'));
      mockPrisma.attendance.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.employeeSchedule.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      await AttendanceService.checkOut(
        {
          attendanceId: 'att-002',
          employeeId: 'emp-002',
          checkOutTime: pastCheckOut.toISOString(),
        },
        session
      );

      expect(mockPrisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'emp-002', organizationId: 'org-001' } })
      );
      expect(mockPrisma.attendance.findFirst.mock.calls[0][0].where.employeeId).toBe('emp-002');
    });

    it('denies Admin attendanceId-only delegation to another employee', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor('emp-admin', 'usr-admin'));
      mockPrisma.attendance.findFirst.mockResolvedValue(null);

      await expect(
        AttendanceService.checkOut(
          { attendanceId: 'att-002', checkOutTime: pastCheckOut.toISOString() },
          adminSession
        )
      ).rejects.toThrowError('Khong tim thay ban ghi cham cong hop le de check-out.');

      expect(mockPrisma.attendance.findFirst.mock.calls[0][0].where.employeeId).toBe('emp-admin');
    });

    it('denies Admin or HR explicit employees outside their tenant', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        AttendanceService.checkOut(
          { employeeId: 'emp-tenant-b', workDate: PAST_DATE, checkOutTime: pastCheckOut.toISOString() },
          hrSession
        )
      ).rejects.toThrowError('Khong tim thay nhan vien hop le trong to chuc hien tai.');

      expect(mockPrisma.employee.findFirst.mock.calls[0][0].where).toEqual({
        id: 'emp-tenant-b',
        organizationId: 'org-001',
      });
      expect(mockPrisma.attendance.findFirst).not.toHaveBeenCalled();
    });

    it('denies an orgless platform SUPER_ADMIN before opening a transaction', async () => {
      await expect(
        AttendanceService.checkOut(
          { workDate: PAST_DATE, checkOutTime: pastCheckOut.toISOString() },
          {
            userId: 'usr-super',
            organizationId: null,
            roles: ['super_admin'],
            email: 'super@test.com',
            fullName: 'Super Admin',
            permissions: ['*'],
            isActive: true,
          }
        )
      ).rejects.toThrowError('Phien dang nhap khong thuoc to chuc hop le de cham cong.');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.employee.findFirst).not.toHaveBeenCalled();
    });

    it('returns the same generic not-found result for an unknown attendanceId', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor('emp-001', 'usr-emp'));
      mockPrisma.attendance.findFirst.mockResolvedValue(null);

      await expect(
        AttendanceService.checkOut(
          { attendanceId: 'att-unknown', checkOutTime: pastCheckOut.toISOString() },
          employeeSession
        )
      ).rejects.toThrowError('Khong tim thay ban ghi cham cong hop le de check-out.');
    });

    it('returns conflict for an already checked-out attendance record', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor('emp-001', 'usr-emp'));
      mockPrisma.attendance.findFirst.mockResolvedValue(completedAttendanceFor('emp-001', 'att-done'));

      await expect(
        AttendanceService.checkOut(
          { attendanceId: 'att-done', checkOutTime: pastCheckOut.toISOString() },
          employeeSession
        )
      ).rejects.toThrowError('Ban ghi cham cong da duoc check-out.');

      expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
    });

    it('returns conflict when checkout time is earlier than check-in time', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor('emp-001', 'usr-emp'));
      mockPrisma.attendance.findFirst.mockResolvedValue({
        ...openAttendanceFor('emp-001'),
        checkInTime: new Date(`${PAST_DATE}T12:00:00+07:00`),
      });

      await expect(
        AttendanceService.checkOut(
          { workDate: PAST_DATE, checkOutTime: `${PAST_DATE}T09:00:00` },
          employeeSession
        )
      ).rejects.toThrowError(/Thời gian check-out .* phải diễn ra sau thời gian check-in/);
    });

    it('fails closed when CAS count is zero and creates no schedule or audit mutations', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor('emp-001', 'usr-emp'));
      mockPrisma.attendance.findFirst.mockResolvedValue(openAttendanceFor('emp-001'));
      mockPrisma.attendance.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        AttendanceService.checkOut(
          { workDate: PAST_DATE, checkOutTime: pastCheckOut.toISOString() },
          employeeSession
        )
      ).rejects.toThrowError('Ban ghi cham cong da thay doi hoac da duoc check-out.');

      expect(mockPrisma.employeeSchedule.update).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
      expect(mockPrisma.attendance.findFirst).toHaveBeenCalledTimes(1);
    });

    it('allows exactly one mutation when two checkout attempts compete for the same open row', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(employeeFor('emp-001', 'usr-emp'));
      mockPrisma.attendance.findFirst
        .mockResolvedValueOnce(openAttendanceFor('emp-001'))
        .mockResolvedValueOnce(completedAttendanceFor('emp-001'))
        .mockResolvedValueOnce(openAttendanceFor('emp-001'));
      mockPrisma.attendance.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      mockPrisma.employeeSchedule.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      await expect(
        AttendanceService.checkOut(
          { attendanceId: 'att-001', checkOutTime: pastCheckOut.toISOString() },
          employeeSession
        )
      ).resolves.toBeDefined();

      await expect(
        AttendanceService.checkOut(
          { attendanceId: 'att-001', checkOutTime: pastCheckOut.toISOString() },
          employeeSession
        )
      ).rejects.toThrowError('Ban ghi cham cong da thay doi hoac da duoc check-out.');

      expect(mockPrisma.employeeSchedule.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it.each(['GPS', 'QR', 'BIOMETRIC'] as const)(
      'persists trusted server checkout provenance %s separately from public input',
      async (method) => {
      arrangeSuccessfulCheckout();

      await AttendanceService.checkOut(
        {
          employeeId: 'emp-001',
          workDate: PAST_DATE,
          checkOutTime: pastCheckOut.toISOString(),
        },
        employeeSession,
        undefined,
        method
      );

      expect(mockPrisma.attendance.updateMany.mock.calls[0][0].data.checkOutMethod).toBe(method);
      }
    );

    it.each(['QR', 'GPS', 'MANUAL', 'BIOMETRIC'] as const)(
      'ignores untrusted client checkout provenance %s and persists WEB',
      async (checkOutMethod) => {
        arrangeSuccessfulCheckout();

        await AttendanceService.checkOut(
          {
            workDate: PAST_DATE,
            checkOutTime: pastCheckOut.toISOString(),
            checkOutMethod,
          } as any,
          employeeSession
        );

        expect(mockPrisma.attendance.updateMany.mock.calls[0][0].data.checkOutMethod).toBe('WEB');
      }
    );
  });

  describe('R1C transaction client propagation', () => {
    const pastCheckIn = new Date(`${PAST_DATE}T08:30:00+07:00`);
    const pastCheckOut = new Date(`${PAST_DATE}T17:30:00+07:00`);

    const arrangeTxCheckIn = () => {
      mockTx.employee.findUnique.mockResolvedValue(activeEmployee);
      mockTx.attendance.findUnique.mockResolvedValue(null);
      mockTx.employeeSchedule.findUnique.mockResolvedValue(null);
      mockTx.recurringSchedule.findFirst.mockResolvedValue({ shift: standardShift });
      mockTx.employeeSchedule.create.mockResolvedValue({ id: 'sch-tx-001' });
      mockTx.attendance.create.mockResolvedValue({
        id: 'att-tx-in',
        employeeId: activeEmployee.id,
        workDate: new Date(PAST_DATE),
        checkInTime: pastCheckIn,
        checkOutTime: null,
        status: 'IN_PROGRESS',
        actualWorkHours: 0,
        otHours: 0,
      });
      mockTx.auditLog.create.mockResolvedValue({});
    };

    const arrangeTxCheckOut = () => {
      mockTx.employee.findFirst.mockResolvedValue(activeEmployee);
      mockTx.attendance.findFirst
        .mockResolvedValueOnce({
          id: 'att-tx-out',
          organizationId: 'org-001',
          employeeId: activeEmployee.id,
          scheduleId: 'sch-tx-001',
          workDate: new Date(PAST_DATE),
          checkInTime: pastCheckIn,
          checkOutTime: null,
          notes: null,
          schedule: { id: 'sch-tx-001', shift: standardShift },
          employee: activeEmployee,
        })
        .mockResolvedValueOnce({
          id: 'att-tx-out',
          employeeId: activeEmployee.id,
          workDate: new Date(PAST_DATE),
          checkInTime: pastCheckIn,
          checkOutTime: pastCheckOut,
          actualWorkHours: 8,
          otHours: 0,
        });
      mockTx.attendance.updateMany.mockResolvedValue({ count: 1 });
      mockTx.employeeSchedule.update.mockResolvedValue({});
      mockTx.auditLog.create.mockResolvedValue({});
    };

    it('standalone check-in opens one transaction and keeps schedule/audit work on its client', async () => {
      arrangeTxCheckIn();
      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTx));

      await AttendanceService.checkIn(
        { workDate: PAST_DATE, checkInTime: pastCheckIn.toISOString() },
        employeeSession
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.employeeSchedule.create).toHaveBeenCalledTimes(1);
      expect(mockTx.attendance.create).toHaveBeenCalledTimes(1);
      expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.employee.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.employeeSchedule.create).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('supplied transaction check-in does not open a nested transaction', async () => {
      arrangeTxCheckIn();

      await AttendanceService.checkIn(
        { workDate: PAST_DATE, checkInTime: pastCheckIn.toISOString() },
        employeeSession,
        mockTx as any,
        'QR'
      );

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockTx.employeeSchedule.create).toHaveBeenCalledTimes(1);
      expect(mockTx.attendance.create).toHaveBeenCalledTimes(1);
      expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    });

    it('standalone check-out preserves R1A scope and CAS on its transaction client', async () => {
      arrangeTxCheckOut();
      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTx));

      await AttendanceService.checkOut(
        { attendanceId: 'att-tx-out', checkOutTime: pastCheckOut.toISOString() },
        employeeSession
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.attendance.findFirst.mock.calls[0][0].where).toEqual({
        id: 'att-tx-out',
        organizationId: 'org-001',
        employeeId: activeEmployee.id,
      });
      expect(mockTx.attendance.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'att-tx-out',
            organizationId: 'org-001',
            employeeId: activeEmployee.id,
            checkOutTime: null,
          },
        })
      );
      expect(mockTx.employeeSchedule.update).toHaveBeenCalledTimes(1);
      expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
    });

    it('supplied transaction check-out does not open a nested transaction', async () => {
      arrangeTxCheckOut();

      await AttendanceService.checkOut(
        { workDate: PAST_DATE, checkOutTime: pastCheckOut.toISOString() },
        employeeSession,
        mockTx as any,
        'QR'
      );

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockTx.attendance.updateMany).toHaveBeenCalledTimes(1);
      expect(mockTx.employeeSchedule.update).toHaveBeenCalledTimes(1);
      expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.employee.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
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
        organizationId: 'org-001',
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
        checkInTime: new Date(`${PAST_DATE}T08:30:00+07:00`),
        checkOutTime: new Date(`${PAST_DATE}T17:30:00+07:00`),
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

      expect(mockPrisma.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            checkInMethod: 'MANUAL',
            checkOutMethod: 'MANUAL',
          }),
        })
      );
      expect(result.actualWorkHours).toBe(8.0);
    });

    it.each([
      {
        label: 'check-out only',
        existingCheckIn: new Date(`${PAST_DATE}T08:30:00+07:00`),
        existingCheckOut: new Date(`${PAST_DATE}T17:30:00+07:00`),
        existingCheckInMethod: 'QR',
        existingCheckOutMethod: 'WEB',
        inputCheckIn: '08:30',
        inputCheckOut: '18:00',
        expectedCheckInMethod: 'QR',
        expectedCheckOutMethod: 'MANUAL',
      },
      {
        label: 'check-in only',
        existingCheckIn: new Date(`${PAST_DATE}T08:30:00+07:00`),
        existingCheckOut: new Date(`${PAST_DATE}T17:30:00+07:00`),
        existingCheckInMethod: 'WEB',
        existingCheckOutMethod: 'GPS',
        inputCheckIn: '08:00',
        inputCheckOut: '17:30',
        expectedCheckInMethod: 'MANUAL',
        expectedCheckOutMethod: 'GPS',
      },
    ])('manual $label change preserves untouched punch provenance and audits both states', async (testCase) => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-002',
        organizationId: 'org-001',
        status: 'ACTIVE',
        deletedAt: null,
      });
      mockPrisma.employeeSchedule.findUnique.mockResolvedValue({
        id: 'sch-002',
        shift: standardShift,
      });
      mockPrisma.attendance.findUnique.mockResolvedValue({
        checkInTime: testCase.existingCheckIn,
        checkOutTime: testCase.existingCheckOut,
        checkInMethod: testCase.existingCheckInMethod,
        checkOutMethod: testCase.existingCheckOutMethod,
      });
      mockPrisma.attendance.upsert.mockResolvedValue({
        id: 'att-manual-existing',
        employeeId: 'emp-002',
        workDate: new Date(PAST_DATE),
        checkInTime: new Date(`${PAST_DATE}T${testCase.inputCheckIn}:00+07:00`),
        checkOutTime: new Date(`${PAST_DATE}T${testCase.inputCheckOut}:00+07:00`),
        checkInMethod: testCase.expectedCheckInMethod,
        checkOutMethod: testCase.expectedCheckOutMethod,
        actualWorkHours: 8,
        otHours: 0,
      });

      await AttendanceService.manualLogAttendance(
        {
          employeeId: 'emp-002',
          workDate: PAST_DATE,
          checkInTime: testCase.inputCheckIn,
          checkOutTime: testCase.inputCheckOut,
        },
        adminSession
      );

      expect(mockPrisma.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            checkInMethod: testCase.expectedCheckInMethod,
            checkOutMethod: testCase.expectedCheckOutMethod,
          }),
        })
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oldValues: expect.objectContaining({
              checkInMethod: testCase.existingCheckInMethod,
              checkOutMethod: testCase.existingCheckOutMethod,
            }),
            newValues: expect.objectContaining({
              checkInMethod: testCase.expectedCheckInMethod,
              checkOutMethod: testCase.expectedCheckOutMethod,
            }),
          }),
        })
      );
    });
  });

  describe('R2A Vietnam business-date resolution', () => {
    it('derives WEB check-in workDate from the Vietnam date at a UTC rollover', async () => {
      const checkInTime = new Date('2026-09-03T18:00:00.000Z');
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.employeeSchedule.findUnique.mockResolvedValue({
        id: 'sch-vn-rollover',
        shift: standardShift,
      });
      mockPrisma.attendance.create.mockImplementation(async ({ data }: any) => ({
        id: 'att-vn-rollover',
        ...data,
        actualWorkHours: 0,
        otHours: 0,
      }));
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await AttendanceService.checkIn(
        { checkInTime: checkInTime.toISOString() },
        employeeSession
      );

      expect(mockPrisma.attendance.create.mock.calls[0][0].data.workDate).toEqual(
        new Date('2026-09-04T00:00:00.000Z')
      );
      expect(result.workDate).toBe('2026-09-04');
    });

    it('checks the current Vietnam date before considering the previous overnight date', async () => {
      const current = {
        id: 'att-current',
        workDate: new Date('2026-09-05T00:00:00.000Z'),
        checkInTime: new Date('2026-09-04T18:00:00.000Z'),
        checkOutTime: null,
      };
      mockPrisma.attendance.findFirst.mockResolvedValueOnce(current);

      const result = await AttendanceService.resolveCheckoutAttendance(
        'org-001',
        'emp-001',
        new Date('2026-09-04T19:00:00.000Z')
      );

      expect(result.attendance).toBe(current);
      expect(result.workDate).toBe('2026-09-05');
      expect(mockPrisma.attendance.findFirst).toHaveBeenCalledTimes(1);
    });

    it('selects the previous date only when the open row proves an active overnight schedule', async () => {
      const overnightAttendance = {
        id: 'att-overnight',
        workDate: new Date('2026-09-04T00:00:00.000Z'),
        checkInTime: new Date('2026-09-04T15:00:00.000Z'),
        checkOutTime: null,
      };
      mockPrisma.attendance.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(overnightAttendance);

      const result = await AttendanceService.resolveCheckoutAttendance(
        'org-001',
        'emp-001',
        new Date('2026-09-04T19:00:00.000Z')
      );

      expect(result.attendance).toBe(overnightAttendance);
      expect(result.workDate).toBe('2026-09-04');
      expect(mockPrisma.attendance.findFirst.mock.calls[1][0].where).toEqual(
        expect.objectContaining({
          organizationId: 'org-001',
          employeeId: 'emp-001',
          workDate: new Date('2026-09-04T00:00:00.000Z'),
          checkInTime: { not: null },
          checkOutTime: null,
          schedule: {
            is: expect.objectContaining({
              organizationId: 'org-001',
              employeeId: 'emp-001',
              shift: {
                is: expect.objectContaining({
                  organizationId: 'org-001',
                  isActive: true,
                  deletedAt: null,
                  isOvernight: true,
                }),
              },
            }),
          },
        })
      );
    });

    it('does not blindly select a previous daytime attendance', async () => {
      mockPrisma.attendance.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await AttendanceService.resolveCheckoutAttendance(
        'org-001',
        'emp-001',
        new Date('2026-09-04T19:00:00.000Z')
      );

      expect(result.attendance).toBeNull();
      expect(mockPrisma.attendance.findFirst.mock.calls[1][0].where.schedule.is.shift.is.isOvernight).toBe(true);
    });
  });

  describe('G05 manager attendance read scope', () => {
    const managerSession = {
      ...employeeSession,
      userId: 'usr-mgr',
      roles: ['manager' as const],
    };
    const managerProfile = { id: 'emp-mgr', managedDepartments: [{ id: 'dept-eng' }] };
    const managerScope = [
      { employeeId: 'emp-mgr' },
      { employee: { departmentId: { in: ['dept-eng'] } } },
    ];
    const params = { status: 'ALL' as const, page: 1, limit: 10 };
    const recordFor = (employeeId: string, departmentId: string) => ({
      id: 'att-scope',
      organizationId: 'org-001',
      employeeId,
      employee: { department: { id: departmentId } },
      workDate: new Date('2026-09-03T00:00:00.000Z'),
      actualWorkHours: 8,
      otHours: 0,
      schedule: null,
    });

    beforeEach(() => {
      mockPrisma.employee.findUnique.mockResolvedValue(managerProfile);
      mockPrisma.attendance.count.mockResolvedValue(0);
      mockPrisma.attendance.findMany.mockResolvedValue([]);
    });

    it('manager query retains own and managed-department scope within the tenant', async () => {
      await AttendanceService.queryAttendance(params, managerSession);

      expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
        where: { userId: 'usr-mgr', organizationId: 'org-001' },
        select: { id: true, managedDepartments: { select: { id: true } } },
      });
      const where = { employee: { organizationId: 'org-001' }, OR: managerScope };
      expect(mockPrisma.attendance.count).toHaveBeenCalledWith({ where });
      expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    });

    it('explicit employeeId outside manager scope only intersects the existing scope', async () => {
      await AttendanceService.queryAttendance({ ...params, employeeId: 'emp-unmanaged' }, managerSession);

      const where = {
        employee: { organizationId: 'org-001' },
        OR: managerScope,
        employeeId: 'emp-unmanaged',
      };
      expect(mockPrisma.attendance.count).toHaveBeenCalledWith({ where });
      expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    });

    it('explicit departmentId outside manager scope only intersects the existing scope', async () => {
      await AttendanceService.queryAttendance({ ...params, departmentId: 'dept-unmanaged' }, managerSession);

      const where = {
        employee: { organizationId: 'org-001', departmentId: 'dept-unmanaged' },
        OR: managerScope,
      };
      expect(mockPrisma.attendance.count).toHaveBeenCalledWith({ where });
      expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    });

    it('employeeId and departmentId filters remain intersections when supplied together', async () => {
      await AttendanceService.queryAttendance(
        { ...params, employeeId: 'emp-unmanaged', departmentId: 'dept-unmanaged' },
        managerSession
      );

      expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          employee: { organizationId: 'org-001', departmentId: 'dept-unmanaged' },
          employeeId: 'emp-unmanaged',
          OR: managerScope,
        },
      }));
    });

    it('manager query fails closed when the employee profile is missing', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(AttendanceService.queryAttendance(params, managerSession))
        .rejects.toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN' });
      expect(mockPrisma.attendance.count).not.toHaveBeenCalled();
      expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
    });

    it('manager query without organization context fails before profile or attendance reads', async () => {
      await expect(AttendanceService.queryAttendance(params, { ...managerSession, organizationId: null }))
        .rejects.toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN' });
      expect(mockPrisma.employee.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.attendance.count).not.toHaveBeenCalled();
      expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
    });

    it('manager with no managed departments retains only the own-attendance branch', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ ...managerProfile, managedDepartments: [] });

      await AttendanceService.queryAttendance(params, managerSession);

      expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          employee: { organizationId: 'org-001' },
          OR: [{ employeeId: 'emp-mgr' }, { employee: { departmentId: { in: [] } } }],
        },
      }));
    });

    it('manager can read own attendance even outside managed departments', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(recordFor('emp-mgr', 'dept-unmanaged'));

      const record = await AttendanceService.getAttendanceById('att-scope', managerSession);

      expect(record.employeeId).toBe('emp-mgr');
      expect(mockPrisma.employee.findUnique).toHaveBeenCalledWith({
        where: { userId: 'usr-mgr', organizationId: 'org-001' },
        select: { id: true, managedDepartments: { select: { id: true } } },
      });
    });

    it('manager can read attendance in a managed department with the tenant lookup intact', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(recordFor('emp-managed', 'dept-eng'));

      const record = await AttendanceService.getAttendanceById('att-scope', managerSession);

      expect(record.employeeId).toBe('emp-managed');
      expect(mockPrisma.attendance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'att-scope', organizationId: 'org-001' },
      }));
    });

    it('manager cannot read another employee attendance in an unmanaged department', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(recordFor('emp-unmanaged', 'dept-unmanaged'));

      await expect(AttendanceService.getAttendanceById('att-scope', managerSession))
        .rejects.toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN' });
    });

    it('manager getAttendanceById fails closed when the employee profile is missing', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(recordFor('emp-managed', 'dept-eng'));
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(AttendanceService.getAttendanceById('att-scope', managerSession))
        .rejects.toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN' });
    });

    it('manager cannot look up foreign-tenant attendance by id', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(null);

      await expect(AttendanceService.getAttendanceById('att-foreign', managerSession))
        .rejects.toMatchObject({ statusCode: 404, errorCode: 'NOT_FOUND' });
      expect(mockPrisma.attendance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'att-foreign', organizationId: 'org-001' },
      }));
      expect(mockPrisma.employee.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      { role: 'admin', session: adminSession },
      { role: 'hr', session: hrSession },
    ])('$role query preserves tenant-wide access without manager scope', async ({ session }) => {
      await AttendanceService.queryAttendance(params, session);

      expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { employee: { organizationId: 'org-001' } },
      }));
      expect(mockPrisma.employee.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      { role: 'admin', session: adminSession },
      { role: 'hr', session: hrSession },
    ])('$role getAttendanceById preserves tenant-wide access without manager scope', async ({ session }) => {
      mockPrisma.attendance.findFirst.mockResolvedValue(recordFor('emp-unmanaged', 'dept-unmanaged'));

      const record = await AttendanceService.getAttendanceById('att-scope', session);

      expect(record.employeeId).toBe('emp-unmanaged');
      expect(mockPrisma.attendance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'att-scope', organizationId: 'org-001' },
      }));
      expect(mockPrisma.employee.findUnique).not.toHaveBeenCalled();
    });

    it('employee query ignores an employeeId override and remains self-only', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-001' });

      await AttendanceService.queryAttendance({ ...params, employeeId: 'emp-other' }, employeeSession);

      expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { employee: { organizationId: 'org-001' }, employeeId: 'emp-001' },
      }));
    });

    it('employee can read own attendance by id', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-001' });
      mockPrisma.attendance.findFirst.mockResolvedValue(recordFor('emp-001', 'dept-eng'));

      const record = await AttendanceService.getAttendanceById('att-scope', employeeSession);

      expect(record.employeeId).toBe('emp-001');
    });

    it('employee cannot read another employee attendance by id', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-001' });
      mockPrisma.attendance.findFirst.mockResolvedValue(recordFor('emp-other', 'dept-eng'));

      await expect(AttendanceService.getAttendanceById('att-scope', employeeSession))
        .rejects.toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN' });
    });
  });

  describe('6. R7-B Regression: Tenant Isolation in Attendance Core', () => {
    const adminSessionWithoutOrg = {
      ...adminSession,
      organizationId: undefined as any,
    };

    it('privileged checkIn with explicit employee target fails closed when caller lacks organizationId', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-002',
        organizationId: 'org-001',
        status: 'ACTIVE',
        deletedAt: null,
      });

      await expect(
        AttendanceService.checkIn(
          {
            employeeId: 'emp-002',
            workDate: PAST_DATE,
            checkInTime: new Date(`${PAST_DATE}T08:30:00+07:00`).toISOString(),
          },
          adminSessionWithoutOrg
        )
      ).rejects.toThrow('Nhân viên không tồn tại hoặc đã nghỉ việc.');
    });

    it('privileged checkIn with explicit target from foreign organization fails closed', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-foreign',
        organizationId: 'org-foreign',
        status: 'ACTIVE',
        deletedAt: null,
      });

      await expect(
        AttendanceService.checkIn(
          {
            employeeId: 'emp-foreign',
            workDate: PAST_DATE,
            checkInTime: new Date(`${PAST_DATE}T08:30:00+07:00`).toISOString(),
          },
          adminSession
        )
      ).rejects.toThrow('Nhân viên không tồn tại hoặc đã nghỉ việc.');
    });

    it('manualLogAttendance fails closed when caller lacks organizationId', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-002',
        organizationId: 'org-001',
        status: 'ACTIVE',
        deletedAt: null,
      });

      await expect(
        AttendanceService.manualLogAttendance(
          {
            employeeId: 'emp-002',
            workDate: PAST_DATE,
            checkInTime: '08:30',
            checkOutTime: '17:30',
          },
          adminSessionWithoutOrg
        )
      ).rejects.toThrow('Nhân viên không tồn tại, đã nghỉ việc hoặc không thuộc tổ chức hiện tại.');
    });

    it('manualLogAttendance fails closed when target employee is from another organization', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-foreign',
        organizationId: 'org-foreign',
        status: 'ACTIVE',
        deletedAt: null,
      });

      await expect(
        AttendanceService.manualLogAttendance(
          {
            employeeId: 'emp-foreign',
            workDate: PAST_DATE,
            checkInTime: '08:30',
            checkOutTime: '17:30',
          },
          adminSession
        )
      ).rejects.toThrow('Nhân viên không tồn tại, đã nghỉ việc hoặc không thuộc tổ chức hiện tại.');
    });

    it('preserves existing checkout tenant fail-closed protection', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(null);

      const candidate = await AttendanceService.resolveCheckoutAttendance(
        'org-001',
        'emp-001',
        new Date('2026-09-04T19:00:00.000Z')
      );

      expect(candidate.attendance).toBeNull();
      expect(mockPrisma.attendance.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-001',
          }),
        })
      );
    });
  });
});

describe('R2 overnight reconciliation and ABSENT recovery', () => {
  const workDate = new Date('2026-09-03T00:00:00.000Z');
  const input = { workDate: PAST_DATE, checkInTime: '2026-09-04T00:05:00+07:00' };
  const schedule = { id: 'sch-night', organizationId: 'org-001', employeeId: 'emp-001', workDate, shift: overnightShift };
  const absent = (): Attendance => ({
    id: 'auto-absent', organizationId: 'org-001', employeeId: 'emp-001', scheduleId: 'sch-night',
    branchId: null, workDate, status: 'ABSENT', notes: RECONCILIATION_ABSENT_NOTES,
    checkInTime: null, checkOutTime: null, checkInMethod: null, checkOutMethod: null,
    checkInLat: null, checkInLng: null, checkOutLat: null, checkOutLng: null,
    lateMinutes: 0, earlyMinutes: 0, actualWorkHours: new Prisma.Decimal(0), otHours: new Prisma.Decimal(0),
  });
  const receipt = () => ({
    id: 'job-receipt', organizationId: 'org-001', actorId: null as string | null,
    action: RECONCILIATION_ABSENT_ACTION, entity: 'attendance', entityId: 'auto-absent',
    oldValues: null,
    newValues: {
      version: 1, employeeId: 'emp-001', scheduleId: 'sch-night',
      workDate: PAST_DATE, shiftEnd: '2026-09-03T23:00:00.000Z',
    },
    createdAt: new Date('2026-09-04T06:00:00+07:00'),
  });
  let row: Attendance | null;
  let receipts: ReturnType<typeof receipt>[];
  let adjustments: Array<{ id: string }>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T06:10:00+07:00'));
    row = absent();
    receipts = [receipt()];
    adjustments = [];
    mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
    mockPrisma.employeeSchedule.findUnique.mockResolvedValue(schedule);
    mockPrisma.employeeSchedule.findFirst.mockResolvedValue({ id: schedule.id });
    mockPrisma.attendance.findUnique.mockImplementation(async () => row);
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'auto-absent' }]);
    mockPrisma.auditLog.findMany.mockImplementation(async () => receipts.slice(0, 2));
    mockPrisma.attendanceAdjustment.findFirst.mockImplementation(async () => adjustments[0] ?? null);
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'recovery-audit' });
    mockPrisma.attendance.updateMany.mockImplementation(async ({ where, data }) => {
      if (!row || adjustments.length > 0) return { count: 0 };
      const matches = Object.entries(where).every(([key, expected]) => {
        if (key === 'adjustments') return true;
        const actual = row![key as keyof Attendance];
        if (expected === null) return actual === null;
        if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
        return String(actual) === String(expected);
      });
      if (!matches) return { count: 0 };
      row = { ...row, ...data };
      return { count: 1 };
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const before = row ? { ...row } : null;
      try { return await callback(mockPrisma); }
      catch (error) { row = before; throw error; }
    });
  });

  afterEach(() => vi.useRealTimers());

  it('recovers only the pristine job record, under a tenant row lock and exact database predicate', async () => {
    const result = await AttendanceService.checkIn(input, employeeSession);
    expect(result).toMatchObject({ id: 'auto-absent', workDate: PAST_DATE, status: 'LATE', checkInMethod: 'WEB' });
    expect(result.checkInTime).toEqual(new Date(input.checkInTime));
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const [sql, id, organizationId] = mockPrisma.$queryRaw.mock.calls[0];
    expect(sql.join('?')).toMatch(/WHERE id = \? AND organization_id = \?[\s\S]*FOR UPDATE/);
    expect([id, organizationId]).toEqual(['auto-absent', 'org-001']);
    expect(mockPrisma.attendance.updateMany.mock.calls[0][0].where).toEqual({
      id: 'auto-absent', organizationId: 'org-001', employeeId: 'emp-001', workDate, scheduleId: 'sch-night',
      status: 'ABSENT', branchId: null, checkInTime: null, checkOutTime: null,
      checkInMethod: null, checkOutMethod: null, checkInLat: null, checkInLng: null, checkOutLat: null, checkOutLng: null,
      lateMinutes: 0, earlyMinutes: 0, actualWorkHours: 0, otHours: 0,
      notes: RECONCILIATION_ABSENT_NOTES, adjustments: { none: {} },
    });
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-001', entity: 'attendance', entityId: 'auto-absent' }, take: 2,
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorId: employeeSession.userId, organizationId: 'org-001', entityId: 'auto-absent',
      action: 'ATTENDANCE_CHECK_IN_RECOVER_ABSENT',
      oldValues: { status: 'ABSENT', receiptAction: RECONCILIATION_ABSENT_ACTION },
    }) });
    expect(mockPrisma.employeeSchedule.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-001', employeeId: 'emp-001', workDate,
      shift: { organizationId: 'org-001', isActive: true, deletedAt: null },
    });
  });

  it('uses a supplied transaction for recovery and audit without opening a nested transaction', async () => {
    const result = await AttendanceService.checkIn(input, employeeSession, mockPrisma as unknown as Prisma.TransactionClient, 'QR');
    expect(result.checkInMethod).toBe('QR');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it.each(['legacy', 'manual', 'HR-edited', 'correction'])('rejects %s ABSENT provenance', async (origin) => {
    if (origin === 'legacy') receipts = [];
    if (origin === 'manual') receipts[0].actorId = 'hr-actor';
    if (origin === 'HR-edited') receipts.push({ ...receipt(), action: 'MANUAL_ATTENDANCE_LOG' });
    if (origin === 'correction') adjustments = [{ id: 'approved-correction' }];
    await expect(AttendanceService.checkIn(input, employeeSession)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  const edits: Array<[string, Partial<Attendance>]> = [
    ['HR note', { notes: 'HR changed this record' }],
    ['manual method', { checkInMethod: 'MANUAL' }],
    ['check-in', { checkInTime: new Date('2026-09-03T15:00:00Z') }],
    ['check-out', { checkOutTime: new Date('2026-09-03T23:00:00Z') }],
    ['GPS', { checkInLat: new Prisma.Decimal(0) }],
    ['late minutes', { lateMinutes: 1 }],
    ['early minutes', { earlyMinutes: 1 }],
    ['hours', { actualWorkHours: new Prisma.Decimal(1) }],
    ['overtime', { otHours: new Prisma.Decimal(1) }],
    ['branch', { branchId: 'branch-hr' }],
  ];
  it.each(edits)('database guard rejects an ABSENT with changed %s', async (_label, edit) => {
    row = { ...row!, ...edit };
    const before = { ...row };
    await expect(AttendanceService.checkIn(input, employeeSession)).rejects.toMatchObject({ statusCode: 409 });
    expect(row).toEqual(before);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(['workDate', 'employeeId', 'scheduleId', 'shiftEnd', 'version'])('rejects a mismatched receipt %s', async (field) => {
    Object.assign(receipts[0].newValues, { [field]: field === 'version' ? 2 : 'incorrect' });
    await expect(AttendanceService.checkIn(input, employeeSession)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a receipt written before the shift end', async () => {
    receipts[0].createdAt = new Date('2026-09-04T05:59:59+07:00');
    await expect(AttendanceService.checkIn(input, employeeSession)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
  });

  it('rejects tenant B before touching tenant A attendance', async () => {
    await expect(AttendanceService.checkIn(input, { ...employeeSession, organizationId: 'org-B' }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.attendance.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a missing session tenant and foreign attendance returned by a stale read', async () => {
    await expect(AttendanceService.checkIn(input, { ...employeeSession, organizationId: null }))
      .rejects.toMatchObject({ statusCode: 403 });
    row!.organizationId = 'org-B';
    await expect(AttendanceService.checkIn(input, employeeSession)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a schedule outside the tenant or no longer SCHEDULED', async () => {
    mockPrisma.employeeSchedule.findFirst.mockResolvedValue(null);
    await expect(AttendanceService.checkIn(input, employeeSession)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
  });

  it('reads again after waiting for the row lock and respects a concurrent HR update', async () => {
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma));
    mockPrisma.$queryRaw.mockImplementation(async () => {
      row = { ...row!, status: 'ON_TIME', checkInMethod: 'MANUAL' };
      return [{ id: 'auto-absent' }];
    });
    await expect(AttendanceService.checkIn(input, employeeSession)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.attendance.findUnique).toHaveBeenCalledTimes(2);
    expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: 'ON_TIME', checkInMethod: 'MANUAL' });
  });

  it('allows only one recovery when two check-ins read ABSENT before acquiring the lock', async () => {
    let complete!: () => void;
    const firstCommitted = new Promise<void>((resolve) => { complete = resolve; });
    let locks = 0;
    mockPrisma.$queryRaw.mockImplementation(async () => {
      locks++;
      if (locks === 2) await firstCommitted;
      return [{ id: 'auto-absent' }];
    });
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const result = await callback(mockPrisma);
      complete();
      return result;
    });
    const results = await Promise.allSettled([
      AttendanceService.checkIn(input, employeeSession), AttendanceService.checkIn(input, employeeSession),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(mockPrisma.attendance.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a correction arriving between the provenance read and the conditional update', async () => {
    mockPrisma.attendanceAdjustment.findFirst.mockImplementation(async () => {
      adjustments.push({ id: 'racing-correction' });
      return null;
    });
    await expect(AttendanceService.checkIn(input, employeeSession)).rejects.toMatchObject({ statusCode: 409 });
    expect(row?.status).toBe('ABSENT');
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rolls recovery back if the transactional audit fails', async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(AttendanceService.checkIn(input, employeeSession)).rejects.toThrow('audit unavailable');
    expect(mockPrisma.attendance.updateMany).toHaveBeenCalledTimes(1);
    expect(row).toEqual(absent());
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each(['P2002', 'P2024'])('propagates recovery update %s without retry or audit', async (code) => {
    const error = new Prisma.PrismaClientKnownRequestError('update failed', {
      code, clientVersion: '6.19.3', meta: { target: ['employee_id', 'work_date'], modelName: 'Attendance' },
    });
    mockPrisma.attendance.updateMany.mockRejectedValue(error);
    await expect(AttendanceService.checkIn(input, employeeSession)).rejects.toBe(error);
    expect(mockPrisma.attendance.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([true, false])('confirms the persisted winner after a create P2002 (present=%s)', async (present) => {
    row = null;
    const error = new Prisma.PrismaClientKnownRequestError('job won the insert', {
      code: 'P2002', clientVersion: '6.19.3', meta: { modelName: 'Attendance', target: ['employee_id', 'work_date'] },
    });
    mockPrisma.attendance.create.mockRejectedValue(error);
    mockPrisma.attendance.findFirst.mockResolvedValue(present ? { id: 'committed-job-row' } : null);
    const attempt = AttendanceService.checkIn(input, employeeSession);
    if (present) await expect(attempt).rejects.toMatchObject({ statusCode: 409 });
    else await expect(attempt).rejects.toBe(error);
    expect(mockPrisma.attendance.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-001', employeeId: 'emp-001', workDate }, select: { id: true },
    });
    expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not query an externally owned transaction after a create P2002', async () => {
    row = null;
    const error = new Prisma.PrismaClientKnownRequestError('unique conflict', {
      code: 'P2002', clientVersion: '6.19.3', meta: { target: ['schedule_id'] },
    });
    mockPrisma.attendance.create.mockRejectedValue(error);
    await expect(AttendanceService.checkIn(input, employeeSession, mockPrisma as unknown as Prisma.TransactionClient)).rejects.toBe(error);
    expect(mockPrisma.attendance.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid shift configuration before recovery or creation', async () => {
    mockPrisma.employeeSchedule.findUnique.mockResolvedValue({ ...schedule, shift: { ...overnightShift, endTime: '25:00' } });
    await expect(AttendanceService.checkIn(input, employeeSession)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.attendance.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-09-03', '2026-09-04T00:05:00+07:00'],
    ['2026-09-03', '2026-09-04T05:59:00+07:00'],
    ['2026-09-03', '2026-09-04T06:00:00+07:00'],
    ['2026-09-30', '2026-10-01T00:05:00+07:00'],
    ['2026-12-31', '2027-01-01T00:05:00+07:00'],
  ])('infers the scheduled overnight start date %s for check-in at %s', async (date, instant) => {
    vi.setSystemTime(new Date(instant));
    row = null;
    const dateCarrier = new Date(`${date}T00:00:00.000Z`);
    mockPrisma.employeeSchedule.findUnique.mockResolvedValue({ ...schedule, workDate: dateCarrier });
    mockPrisma.attendance.create.mockImplementation(async ({ data }) => ({ id: 'new-night', ...data }));
    const result = await AttendanceService.checkIn({}, employeeSession);
    expect(result.workDate).toBe(date);
    expect(mockPrisma.attendance.create.mock.calls[0][0].data.workDate).toEqual(dateCarrier);
    expect(mockPrisma.attendance.create.mock.calls[0][0].data.checkInTime).toEqual(new Date(instant));
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.newValues.workDate).toBe(date);
    expect(mockPrisma.employeeSchedule.findUnique.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-001', shift: { organizationId: 'org-001', isOvernight: true },
    });
  });
});
