/**
 * PHASE 9 — ATTENDANCE CORRECTION & EXCEPTIONS TEST SUITE
 *
 * Requirements tested:
 * 1. Handling all 7 exception/correction types:
 *    - FORGOT_CHECKIN
 *    - FORGOT_CHECKOUT
 *    - LATE_JUSTIFICATION
 *    - EARLY_LEAVE_JUSTIFICATION
 *    - FULL_CORRECTION
 *    - OVERTIME_REQUEST
 *    - MISSING_ATTENDANCE
 * 2. Approval Workflow & Role-based Access Control:
 *    - Employee creates request
 *    - Employee cannot approve/reject
 *    - Manager processes requests only for managed departments
 *    - Manager cannot self-approve
 *    - HR / Admin processes any request
 * 3. Immutable Audit Trail & History Preservation:
 *    - Original attendance history NEVER silently overwritten during creation or rejection
 *    - All operations record audit logs
 *    - Approval creates audit log capturing old attendance snapshot vs new state
 * 4. Cancellation by Employee:
 *    - Employee cancels own pending request
 *    - Cannot cancel processed requests or others' requests
 * 5. Query & Listing RBAC Scoping:
 *    - Employee restricted to own requests
 *    - Manager scoped to managed departments
 *    - HR/Admin gets global view
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  attendance: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
  },
  attendanceAdjustment: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  workShift: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  employeeSchedule: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'sched-fallback-1' }),
  },
  recurringSchedule: {
    findFirst: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AttendanceCorrectionService } from '@/lib/services/attendance-correction.service';

// ── Test Sessions ─────────────────────────────────────────────────────────────

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

const managerSession = {
  userId: 'usr-mgr',
  roles: ['manager' as const],
  email: 'mgr@test.com',
  fullName: 'Manager User',
  departmentId: 'dept-eng',
  permissions: [],
  isActive: true,
};

const employeeSession = {
  userId: 'usr-emp1',
  roles: ['employee' as const],
  email: 'emp1@test.com',
  fullName: 'Employee 1',
  permissions: [],
  isActive: true,
};

const otherEmployeeSession = {
  userId: 'usr-emp2',
  roles: ['employee' as const],
  email: 'emp2@test.com',
  fullName: 'Employee 2',
  permissions: [],
  isActive: true,
};

// ── Test Dates & Constants ───────────────────────────────────────────────────

const PAST_DATE = '2026-09-02';

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
};

const emp1Record = {
  id: 'emp-001',
  userId: 'usr-emp1',
  employeeCode: 'EMP-001',
  firstName: 'Văn A',
  lastName: 'Nguyễn',
  departmentId: 'dept-eng',
  status: 'ACTIVE',
  deletedAt: null,
};

const emp2Record = {
  id: 'emp-002',
  userId: 'usr-emp2',
  employeeCode: 'EMP-002',
  firstName: 'Thị B',
  lastName: 'Trần',
  departmentId: 'dept-sales',
  status: 'ACTIVE',
  deletedAt: null,
};

const managerEmpRecord = {
  id: 'emp-mgr',
  userId: 'usr-mgr',
  employeeCode: 'EMP-MGR',
  firstName: 'Quản Lý',
  lastName: 'Lê',
  departmentId: 'dept-eng',
  managedDepartments: [{ id: 'dept-eng' }],
  status: 'ACTIVE',
  deletedAt: null,
};

describe('PHASE 9 — ATTENDANCE CORRECTION & EXCEPTIONS TEST SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

    // Default employee mocks
    mockPrisma.employee.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.userId === 'usr-emp1' || where.id === 'emp-001') return emp1Record;
      if (where.userId === 'usr-emp2' || where.id === 'emp-002') return emp2Record;
      if (where.userId === 'usr-mgr' || where.id === 'emp-mgr') return managerEmpRecord;
      if (where.userId === 'usr-admin') return { id: 'emp-admin', status: 'ACTIVE', deletedAt: null };
      if (where.userId === 'usr-hr') return { id: 'emp-hr', status: 'ACTIVE', deletedAt: null };
      return null;
    });

    // Default shift mocks
    mockPrisma.workShift.findFirst.mockResolvedValue(standardShift);
    mockPrisma.workShift.findUnique.mockResolvedValue(standardShift);
    mockPrisma.employeeSchedule.findUnique.mockResolvedValue(null);
    mockPrisma.recurringSchedule.findFirst.mockResolvedValue(null);
  });

  // ===========================================================================
  // 1. CREATE CORRECTION REQUESTS (7 TYPES & PRECONDITIONS)
  // ===========================================================================
  describe('1. Create Correction Requests & Validation', () => {
    it('1.1 allows employee to submit FORGOT_CHECKIN request', async () => {
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendanceAdjustment.findFirst.mockResolvedValue(null);
      mockPrisma.attendanceAdjustment.create.mockResolvedValue({
        id: 'adj-001',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        correctionType: 'FORGOT_CHECKIN',
        requestedCheckIn: new Date(`${PAST_DATE}T08:30:00`),
        requestedCheckOut: null,
        reason: 'Quên bấm máy chấm công buổi sáng do vội vào họp',
        status: 'PENDING',
      });

      const res = await AttendanceCorrectionService.createCorrection(
        {
          workDate: PAST_DATE,
          correctionType: 'FORGOT_CHECKIN',
          requestedCheckIn: `${PAST_DATE}T08:30:00`,
          reason: 'Quên bấm máy chấm công buổi sáng do vội vào họp',
        },
        employeeSession
      );

      expect(res.id).toBe('adj-001');
      expect(res.status).toBe('PENDING');
      // Guarantee: Original attendance was NOT modified or created yet
      expect(mockPrisma.attendance.update).not.toHaveBeenCalled();
      expect(mockPrisma.attendance.upsert).not.toHaveBeenCalled();
      // Audit log created
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_ATTENDANCE_CORRECTION',
            entity: 'attendance_adjustment',
          }),
        })
      );
    });

    it('1.2 allows employee to submit FORGOT_CHECKOUT when checkIn exists but checkOut is missing', async () => {
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-001',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        checkInTime: new Date(`${PAST_DATE}T08:30:00`),
        checkOutTime: null,
      });
      mockPrisma.attendanceAdjustment.findFirst.mockResolvedValue(null);
      mockPrisma.attendanceAdjustment.create.mockResolvedValue({
        id: 'adj-002',
        employeeId: 'emp-001',
        correctionType: 'FORGOT_CHECKOUT',
        status: 'PENDING',
      });

      const res = await AttendanceCorrectionService.createCorrection(
        {
          workDate: PAST_DATE,
          correctionType: 'FORGOT_CHECKOUT',
          requestedCheckOut: `${PAST_DATE}T17:30:00`,
          reason: 'Chiều về vội đón con nên quên quét mã check-out',
        },
        employeeSession
      );

      expect(res.status).toBe('PENDING');
    });

    it('1.3 rejects FORGOT_CHECKOUT if day already has check-out recorded', async () => {
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-001',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        checkInTime: new Date(`${PAST_DATE}T08:30:00`),
        checkOutTime: new Date(`${PAST_DATE}T17:30:00`),
      });

      await expect(
        AttendanceCorrectionService.createCorrection(
          {
            workDate: PAST_DATE,
            correctionType: 'FORGOT_CHECKOUT',
            requestedCheckOut: `${PAST_DATE}T18:00:00`,
            reason: 'Muốn đổi giờ check-out muộn hơn chút',
          },
          employeeSession
        )
      ).rejects.toThrow('đã có giờ check-out');
    });

    it('1.4 allows LATE_JUSTIFICATION when lateMinutes > 0', async () => {
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-002',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        lateMinutes: 30,
        earlyMinutes: 0,
      });
      mockPrisma.attendanceAdjustment.findFirst.mockResolvedValue(null);
      mockPrisma.attendanceAdjustment.create.mockResolvedValue({
        id: 'adj-003',
        correctionType: 'LATE_JUSTIFICATION',
        status: 'PENDING',
      });

      const res = await AttendanceCorrectionService.createCorrection(
        {
          workDate: PAST_DATE,
          correctionType: 'LATE_JUSTIFICATION',
          reason: 'Bị kẹt xe do tai nạn giao thông trên đường Cộng Hòa',
        },
        employeeSession
      );

      expect(res.status).toBe('PENDING');
    });

    it('1.5 rejects LATE_JUSTIFICATION if lateMinutes is 0', async () => {
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-003',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        lateMinutes: 0,
        earlyMinutes: 0,
      });

      await expect(
        AttendanceCorrectionService.createCorrection(
          {
            workDate: PAST_DATE,
            correctionType: 'LATE_JUSTIFICATION',
            reason: 'Giải trình đi muộn dù hệ thống ghi nhận đúng giờ',
          },
          employeeSession
        )
      ).rejects.toThrow('không ghi nhận đi muộn');
    });

    it('1.6 allows EARLY_LEAVE_JUSTIFICATION when earlyMinutes > 0', async () => {
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-004',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        lateMinutes: 0,
        earlyMinutes: 45,
      });
      mockPrisma.attendanceAdjustment.findFirst.mockResolvedValue(null);
      mockPrisma.attendanceAdjustment.create.mockResolvedValue({
        id: 'adj-004',
        correctionType: 'EARLY_LEAVE_JUSTIFICATION',
        status: 'PENDING',
      });

      const res = await AttendanceCorrectionService.createCorrection(
        {
          workDate: PAST_DATE,
          correctionType: 'EARLY_LEAVE_JUSTIFICATION',
          reason: 'Về sớm 45p có xin phép quản lý trực tiếp qua tin nhắn để đi khám bệnh',
        },
        employeeSession
      );

      expect(res.status).toBe('PENDING');
    });

    it('1.7 allows OVERTIME_REQUEST with valid overtimeMinutes', async () => {
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-005',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        checkInTime: new Date(`${PAST_DATE}T08:30:00`),
        checkOutTime: new Date(`${PAST_DATE}T20:00:00`),
      });
      mockPrisma.attendanceAdjustment.findFirst.mockResolvedValue(null);
      mockPrisma.attendanceAdjustment.create.mockResolvedValue({
        id: 'adj-005',
        correctionType: 'OVERTIME_REQUEST',
        overtimeMinutes: 120,
        status: 'PENDING',
      });

      const res = await AttendanceCorrectionService.createCorrection(
        {
          workDate: PAST_DATE,
          correctionType: 'OVERTIME_REQUEST',
          overtimeMinutes: 120,
          reason: 'Tăng ca 2 giờ hỗ trợ deploy release lên môi trường production',
        },
        employeeSession
      );

      expect(res.status).toBe('PENDING');
    });

    it('1.8 allows MISSING_ATTENDANCE when no attendance record exists', async () => {
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendanceAdjustment.findFirst.mockResolvedValue(null);
      mockPrisma.attendanceAdjustment.create.mockResolvedValue({
        id: 'adj-006',
        correctionType: 'MISSING_ATTENDANCE',
        status: 'PENDING',
      });

      const res = await AttendanceCorrectionService.createCorrection(
        {
          workDate: PAST_DATE,
          correctionType: 'MISSING_ATTENDANCE',
          requestedCheckIn: `${PAST_DATE}T08:30:00`,
          requestedCheckOut: `${PAST_DATE}T17:30:00`,
          reason: 'Đi công tác tại chi nhánh miền Tây cả ngày không có máy chấm công',
        },
        employeeSession
      );

      expect(res.status).toBe('PENDING');
    });

    it('1.9 rejects future dates (> today)', async () => {
      const futureDate = '2099-01-01';
      await expect(
        AttendanceCorrectionService.createCorrection(
          {
            workDate: futureDate,
            correctionType: 'FORGOT_CHECKIN',
            requestedCheckIn: `${futureDate}T08:30:00`,
            reason: 'Tạo trước yêu cầu cho tương lai',
          },
          employeeSession
        )
      ).rejects.toThrow('tương lai');
    });

    it('1.10 rejects dates older than 90 days', async () => {
      const veryOldDate = '2020-01-01';
      await expect(
        AttendanceCorrectionService.createCorrection(
          {
            workDate: veryOldDate,
            correctionType: 'FORGOT_CHECKIN',
            requestedCheckIn: `${veryOldDate}T08:30:00`,
            reason: 'Xin sửa công từ 6 năm trước',
          },
          employeeSession
        )
      ).rejects.toThrow('90 ngày');
    });

    it('1.11 prevents duplicate PENDING request for same employee, date and type', async () => {
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.attendanceAdjustment.findFirst.mockResolvedValue({
        id: 'existing-pending-adj',
        status: 'PENDING',
      });

      await expect(
        AttendanceCorrectionService.createCorrection(
          {
            workDate: PAST_DATE,
            correctionType: 'FORGOT_CHECKIN',
            requestedCheckIn: `${PAST_DATE}T08:30:00`,
            reason: 'Tạo yêu cầu trùng lặp lần thứ hai',
          },
          employeeSession
        )
      ).rejects.toThrow('Đang có một yêu cầu FORGOT_CHECKIN ở trạng thái chờ duyệt');
    });

    it('1.12 regular employee cannot create request on behalf of another employee', async () => {
      await expect(
        AttendanceCorrectionService.createCorrection(
          {
            workDate: PAST_DATE,
            correctionType: 'FORGOT_CHECKIN',
            requestedCheckIn: `${PAST_DATE}T08:30:00`,
            reason: 'Tạo hộ bạn đồng nghiệp',
          },
          employeeSession,
          'emp-002' // target other employee
        )
      ).rejects.toThrow('Chỉ Quản trị viên hoặc Nhân sự mới có quyền');
    });
  });

  // ===========================================================================
  // 2. APPROVAL WORKFLOW & RBAC ENFORCEMENT
  // ===========================================================================
  describe('2. Process Correction Requests (Approval Workflow)', () => {
    const pendingAdjustment = {
      id: 'adj-pending-1',
      employeeId: 'emp-001',
      workDate: new Date(PAST_DATE),
      correctionType: 'FORGOT_CHECKOUT',
      requestedCheckIn: null,
      requestedCheckOut: new Date(`${PAST_DATE}T17:30:00`),
      overtimeMinutes: null,
      status: 'PENDING',
      reason: 'Quên check-out',
      employee: {
        id: 'emp-001',
        employeeCode: 'EMP-001',
        firstName: 'Văn A',
        lastName: 'Nguyễn',
        departmentId: 'dept-eng',
      },
    };

    it('2.1 regular employee CANNOT approve or reject requests (403 Forbidden)', async () => {
      await expect(
        AttendanceCorrectionService.processCorrection(
          'adj-pending-1',
          { decision: 'APPROVED' },
          employeeSession
        )
      ).rejects.toThrow('Chỉ Quản lý, Nhân sự hoặc Quản trị viên');
    });

    it('2.2 manager cannot approve request for employee in another department', async () => {
      // Adjustment belongs to emp-002 (dept-sales), but manager only manages dept-eng
      mockPrisma.attendanceAdjustment.findUnique.mockResolvedValue({
        ...pendingAdjustment,
        employeeId: 'emp-002',
        employee: { ...emp2Record, departmentId: 'dept-sales' },
      });

      await expect(
        AttendanceCorrectionService.processCorrection(
          'adj-pending-1',
          { decision: 'APPROVED' },
          managerSession
        )
      ).rejects.toThrow('Bạn không quản lý phòng ban của nhân viên này.');
    });

    it('2.3 manager cannot approve their own correction request', async () => {
      mockPrisma.attendanceAdjustment.findUnique.mockResolvedValue({
        ...pendingAdjustment,
        employeeId: 'emp-mgr',
        employee: { ...managerEmpRecord },
      });

      await expect(
        AttendanceCorrectionService.processCorrection(
          'adj-pending-1',
          { decision: 'APPROVED' },
          managerSession
        )
      ).rejects.toThrow('Quản lý không thể tự phê duyệt');
    });

    it('2.4 rejecting a request updates status to REJECTED and preserves original attendance untouched', async () => {
      mockPrisma.attendanceAdjustment.findUnique.mockResolvedValue(pendingAdjustment);
      mockPrisma.attendanceAdjustment.update.mockResolvedValue({
        ...pendingAdjustment,
        status: 'REJECTED',
        approvalNotes: 'Không có minh chứng hợp lệ',
      });

      const res = await AttendanceCorrectionService.processCorrection(
        'adj-pending-1',
        {
          decision: 'REJECTED',
          approvalNotes: 'Không có minh chứng hợp lệ',
        },
        managerSession
      );

      expect(res.status).toBe('REJECTED');
      // Guarantee: Attendance table is NEVER updated or upserted on rejection
      expect(mockPrisma.attendance.update).not.toHaveBeenCalled();
      expect(mockPrisma.attendance.upsert).not.toHaveBeenCalled();

      // Guarantee: Audit log created
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REJECT_ATTENDANCE_CORRECTION',
            entity: 'attendance_adjustment',
          }),
        })
      );
    });

    it('2.5 approving updates attendance with audit trail and oldValues snapshot', async () => {
      const originalAttendance = {
        id: 'att-orig-1',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        checkInTime: new Date(`${PAST_DATE}T08:30:00`),
        checkOutTime: null,
        checkInMethod: 'WEB',
        checkOutMethod: null,
        lateMinutes: 0,
        earlyMinutes: 0,
        actualWorkHours: new Prisma.Decimal(0),
        otHours: new Prisma.Decimal(0),
        status: 'IN_PROGRESS',
        notes: null,
      };

      mockPrisma.attendanceAdjustment.findUnique.mockResolvedValue(pendingAdjustment);
      mockPrisma.attendance.findUnique.mockResolvedValue(originalAttendance);

      const updatedAttendanceRecord = {
        ...originalAttendance,
        checkOutTime: new Date(`${PAST_DATE}T17:30:00`),
        checkOutMethod: 'CORRECTED',
        actualWorkHours: new Prisma.Decimal(8.0),
        status: 'ON_TIME',
        notes: '[Đã điều chỉnh theo yêu cầu #adj-pend]',
      };

      mockPrisma.attendance.upsert.mockResolvedValue(updatedAttendanceRecord);
      mockPrisma.attendanceAdjustment.update.mockResolvedValue({
        ...pendingAdjustment,
        status: 'APPROVED',
        attendanceId: 'att-orig-1',
      });

      const res = await AttendanceCorrectionService.processCorrection(
        'adj-pending-1',
        {
          decision: 'APPROVED',
          approvalNotes: 'Đã xác minh qua camera ra vào',
        },
        managerSession
      );

      expect(res.status).toBe('APPROVED');
      // Verify attendance upsert was called to apply the correction
      expect(mockPrisma.attendance.upsert).toHaveBeenCalled();

      // Verify audit log captured both oldValues (original snapshot) and newValues
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'APPROVE_ATTENDANCE_CORRECTION',
            entity: 'attendance_adjustment',
            oldValues: expect.objectContaining({
              attendance: expect.objectContaining({
                id: 'att-orig-1',
                checkInTime: expect.any(String),
                checkOutTime: null,
              }),
            }),
            newValues: expect.objectContaining({
              attendance: expect.objectContaining({
                id: 'att-orig-1',
                checkOutMethod: 'CORRECTED',
              }),
            }),
          }),
        })
      );
    });

    it('2.6 approving LATE_JUSTIFICATION excuses late minutes (sets lateMinutes to 0)', async () => {
      const lateAdjustment = {
        ...pendingAdjustment,
        id: 'adj-late-1',
        correctionType: 'LATE_JUSTIFICATION',
        requestedCheckIn: null,
        requestedCheckOut: null,
      };

      const originalAttendance = {
        id: 'att-late-1',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        checkInTime: new Date(`${PAST_DATE}T09:15:00`),
        checkOutTime: new Date(`${PAST_DATE}T17:30:00`),
        checkInMethod: 'WEB',
        checkOutMethod: 'WEB',
        lateMinutes: 45,
        earlyMinutes: 0,
        actualWorkHours: new Prisma.Decimal(7.25),
        otHours: new Prisma.Decimal(0),
        status: 'LATE',
        notes: null,
      };

      mockPrisma.attendanceAdjustment.findUnique.mockResolvedValue(lateAdjustment);
      mockPrisma.attendance.findUnique.mockResolvedValue(originalAttendance);
      mockPrisma.attendance.upsert.mockResolvedValue({
        ...originalAttendance,
        lateMinutes: 0,
        status: 'ON_TIME',
      });
      mockPrisma.attendanceAdjustment.update.mockResolvedValue({
        ...lateAdjustment,
        status: 'APPROVED',
      });

      await AttendanceCorrectionService.processCorrection(
        'adj-late-1',
        { decision: 'APPROVED', approvalNotes: 'Duyệt lý do kẹt xe' },
        managerSession
      );

      expect(mockPrisma.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            lateMinutes: 0,
            status: 'ON_TIME',
          }),
        })
      );
    });

    it('2.7 approving OVERTIME_REQUEST adds approved overtime hours to attendance', async () => {
      const otAdjustment = {
        ...pendingAdjustment,
        id: 'adj-ot-1',
        correctionType: 'OVERTIME_REQUEST',
        overtimeMinutes: 120, // 2 hours
        requestedCheckIn: null,
        requestedCheckOut: null,
      };

      const originalAttendance = {
        id: 'att-ot-1',
        employeeId: 'emp-001',
        workDate: new Date(PAST_DATE),
        checkInTime: new Date(`${PAST_DATE}T08:30:00`),
        checkOutTime: new Date(`${PAST_DATE}T17:30:00`),
        lateMinutes: 0,
        earlyMinutes: 0,
        actualWorkHours: new Prisma.Decimal(8.0),
        otHours: new Prisma.Decimal(0.0),
        status: 'ON_TIME',
      };

      mockPrisma.attendanceAdjustment.findUnique.mockResolvedValue(otAdjustment);
      mockPrisma.attendance.findUnique.mockResolvedValue(originalAttendance);
      mockPrisma.attendance.upsert.mockResolvedValue({
        ...originalAttendance,
        otHours: new Prisma.Decimal(2.0),
        status: 'OVERTIME',
      });
      mockPrisma.attendanceAdjustment.update.mockResolvedValue({
        ...otAdjustment,
        status: 'APPROVED',
      });

      await AttendanceCorrectionService.processCorrection(
        'adj-ot-1',
        { decision: 'APPROVED', approvalNotes: 'Duyệt OT dự án' },
        hrSession
      );

      expect(mockPrisma.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            otHours: new Prisma.Decimal(2.0),
            status: 'OVERTIME',
          }),
        })
      );
    });

    it('2.8 rejects processing a request that has already been processed', async () => {
      mockPrisma.attendanceAdjustment.findUnique.mockResolvedValue({
        ...pendingAdjustment,
        status: 'APPROVED',
      });

      await expect(
        AttendanceCorrectionService.processCorrection(
          'adj-pending-1',
          { decision: 'REJECTED' },
          adminSession
        )
      ).rejects.toThrow('đã được xử lý trước đó');
    });
  });

  // ===========================================================================
  // 3. CANCELLATION BY EMPLOYEE
  // ===========================================================================
  describe('3. Cancel Correction Request', () => {
    it('3.1 employee can cancel their own PENDING request', async () => {
      mockPrisma.attendanceAdjustment.findUnique.mockResolvedValue({
        id: 'adj-cancel-1',
        employeeId: 'emp-001',
        status: 'PENDING',
      });
      mockPrisma.attendanceAdjustment.update.mockResolvedValue({
        id: 'adj-cancel-1',
        status: 'CANCELLED',
      });

      const res = await AttendanceCorrectionService.cancelCorrection(
        'adj-cancel-1',
        { reason: 'Tìm lại được thẻ chấm công' },
        employeeSession
      );

      expect(res.status).toBe('CANCELLED');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CANCEL_ATTENDANCE_CORRECTION',
          }),
        })
      );
    });

    it('3.2 employee cannot cancel another employee request', async () => {
      mockPrisma.attendanceAdjustment.findUnique.mockResolvedValue({
        id: 'adj-cancel-2',
        employeeId: 'emp-002', // belongs to emp-002
        status: 'PENDING',
      });

      await expect(
        AttendanceCorrectionService.cancelCorrection(
          'adj-cancel-2',
          { reason: 'Cố tình hủy của người khác' },
          employeeSession
        )
      ).rejects.toThrow('Bạn chỉ có thể hủy yêu cầu của chính mình.');
    });

    it('3.3 cannot cancel already processed request', async () => {
      mockPrisma.attendanceAdjustment.findUnique.mockResolvedValue({
        id: 'adj-cancel-3',
        employeeId: 'emp-001',
        status: 'APPROVED',
      });

      await expect(
        AttendanceCorrectionService.cancelCorrection(
          'adj-cancel-3',
          {},
          employeeSession
        )
      ).rejects.toThrow('Chỉ có thể hủy yêu cầu đang ở trạng thái chờ duyệt');
    });
  });

  // ===========================================================================
  // 4. LISTING & RBAC SCOPING
  // ===========================================================================
  describe('4. List Corrections & RBAC Scoping', () => {
    it('4.1 scopes regular employee to their own requests only', async () => {
      mockPrisma.attendanceAdjustment.count.mockResolvedValue(1);
      mockPrisma.attendanceAdjustment.findMany.mockResolvedValue([
        {
          id: 'adj-list-1',
          employeeId: 'emp-001',
          workDate: new Date(PAST_DATE),
          status: 'PENDING',
        },
      ]);

      const res = await AttendanceCorrectionService.listCorrections(
        { status: 'ALL', page: 1, limit: 10 },
        employeeSession
      );

      expect(res.items.length).toBe(1);
      expect(mockPrisma.attendanceAdjustment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: 'emp-001',
          }),
        })
      );
    });

    it('4.2 scopes manager to managed department requests and own', async () => {
      mockPrisma.attendanceAdjustment.count.mockResolvedValue(2);
      mockPrisma.attendanceAdjustment.findMany.mockResolvedValue([]);

      await AttendanceCorrectionService.listCorrections(
        { status: 'ALL', page: 1, limit: 10 },
        managerSession
      );

      expect(mockPrisma.attendanceAdjustment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { employeeId: 'emp-mgr' },
              { employee: { is: { departmentId: { in: ['dept-eng'] } } } },
            ]),
          }),
        })
      );
    });

    it('4.3 HR/Admin can query without employee or department scope', async () => {
      mockPrisma.attendanceAdjustment.count.mockResolvedValue(5);
      mockPrisma.attendanceAdjustment.findMany.mockResolvedValue([]);

      await AttendanceCorrectionService.listCorrections(
        { status: 'PENDING', page: 1, limit: 50 },
        hrSession
      );

      expect(mockPrisma.attendanceAdjustment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      );
    });
  });
});
