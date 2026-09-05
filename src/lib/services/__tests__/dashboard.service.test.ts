import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  employee: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  attendance: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  leaveRequest: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  attendanceAdjustment: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  payrollPeriod: {
    findFirst: vi.fn(),
  },
  payroll: {
    findFirst: vi.fn(),
  },
  employeeBonusPenalty: {
    findMany: vi.fn(),
  },
  department: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  employeeKpiResult: {
    findMany: vi.fn(),
  },
  notification: {
    count: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DashboardService } from '../dashboard.service';
import { UserSession } from '@/types';

describe('Phase 18 — Role-Based Dashboard Service', () => {
  const adminSession: UserSession = {
    userId: 'usr-admin',
    employeeId: 'emp-admin',
    fullName: 'Quản Trị Viên',
    email: 'admin@antigravity.internal',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
  };

  const managerSession: UserSession = {
    userId: 'usr-mgr',
    employeeId: 'emp-mgr',
    departmentId: 'dept-tech',
    fullName: 'Lê Hoàng Nam',
    email: 'manager.tech@antigravity.internal',
    roles: ['manager'],
    permissions: ['attendance:read_dept', 'leave:read_dept'],
    isActive: true,
  };

  const employeeSession: UserSession = {
    userId: 'usr-emp',
    employeeId: 'emp-dev-1',
    departmentId: 'dept-tech',
    fullName: 'Phạm Văn An',
    email: 'dev.an@antigravity.internal',
    roles: ['employee'],
    permissions: ['attendance:read_self'],
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Admin/HR Dashboard Tests ──────────────────────────────────────────
  describe('Admin/HR Dashboard (getAdminHrDashboard)', () => {
    it('accurately computes all 10 required Admin/HR metrics with real database values', async () => {
      // 1. Total employees
      mockPrisma.employee.count.mockResolvedValue(50);

      // 2. Today's attendance
      mockPrisma.attendance.findMany.mockImplementation((args: any) => {
        // If it's today's attendance
        if (args?.select?.actualWorkHours) {
          return Promise.resolve([
            { id: 'att-1', employeeId: 'emp-1', checkInTime: new Date(), lateMinutes: 0, status: 'PRESENT', actualWorkHours: 8, otHours: 1.5 },
            { id: 'att-2', employeeId: 'emp-2', checkInTime: new Date(), lateMinutes: 15, status: 'LATE', actualWorkHours: 7.75, otHours: 0 },
            { id: 'att-3', employeeId: 'emp-3', checkInTime: null, lateMinutes: 0, status: 'PENDING', actualWorkHours: 0, otHours: 0 },
          ]);
        }
        // Trend chart past days
        return Promise.resolve([
          { checkInTime: new Date(), lateMinutes: 0, status: 'PRESENT' },
          { checkInTime: new Date(), lateMinutes: 10, status: 'LATE' },
        ]);
      });

      // 3. Leaves today
      mockPrisma.leaveRequest.findMany.mockResolvedValue([
        { employeeId: 'emp-leave-1' },
        { employeeId: 'emp-leave-2' },
      ]);

      // 4. Pending counts
      mockPrisma.leaveRequest.count.mockResolvedValue(7);
      mockPrisma.attendanceAdjustment.count.mockResolvedValue(4);

      // 5. Payroll status
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue({
        id: 'pp-01',
        code: 'PAY-2026-09',
        name: 'Kỳ Lương Tháng 09/2026',
        status: 'SUBMITTED',
        standardWorkDays: 22,
        totalGrossPayout: 1200000000,
        totalNetPayout: 1050000000,
        payrolls: [{ id: 'p1' }, { id: 'p2' }],
      });

      // 6. Overtime monthly aggregation
      mockPrisma.attendance.aggregate.mockResolvedValue({
        _sum: { otHours: 84.5 },
      });

      // 7. Bonuses and Penalties
      mockPrisma.employeeBonusPenalty.findMany.mockImplementation((args: any) => {
        if (args?.where?.type === 'BONUS') {
          return Promise.resolve([
            { amount: 5000000 },
            { amount: 3000000 },
          ]);
        }
        return Promise.resolve([
          { amount: 500000 },
        ]);
      });

      // 8. Departments
      mockPrisma.department.findMany.mockResolvedValue([
        {
          id: 'dept-tech',
          code: 'TECH',
          name: 'Phòng Kỹ Thuật',
          employees: [{ contractSalary: 35000000 }, { contractSalary: 25000000 }],
        },
        {
          id: 'dept-hr',
          code: 'HR',
          name: 'Phòng Nhân Sự',
          employees: [{ contractSalary: 28000000 }],
        },
      ]);

      const result = await DashboardService.getAdminHrDashboard(adminSession);

      // Verify all 10 core metrics
      expect(result.totalEmployees).toBe(50);
      expect(result.presentToday).toBe(2); // att-1 and att-2
      expect(result.lateToday).toBe(1); // att-2 has lateMinutes: 15
      expect(result.absentToday).toBe(46); // 50 - 2 (present) - 2 (on leave) = 46
      expect(result.pendingLeave).toBe(7);
      expect(result.pendingAttendance).toBe(4);
      expect(result.payrollStatus.code).toBe('PAY-2026-09');
      expect(result.payrollStatus.status).toBe('SUBMITTED');
      expect(result.payrollStatus.employeeCount).toBe(2);
      expect(result.overtime.todayHours).toBe(1.5);
      expect(result.overtime.monthHours).toBe(84.5);
      expect(result.bonus.totalAmount).toBe(8000000);
      expect(result.bonus.count).toBe(2);
      expect(result.penalty.totalAmount).toBe(500000);
      expect(result.penalty.count).toBe(1);

      // Verify charts data
      expect(result.charts.attendanceTrend).toHaveLength(7);
      expect(result.charts.departmentDistribution).toHaveLength(2);
      expect(result.charts.departmentDistribution[0].totalSalary).toBe(60000000);
      expect(result.charts.rewardComparison.netReward).toBe(7500000); // 8M - 500k
    });
  });

  // ── 2. Manager Dashboard Tests ────────────────────────────────────────────
  describe('Manager Dashboard (getManagerDashboard)', () => {
    it('scopes team attendance, lateness, KPI, and approval queue to manager department', async () => {
      // 1. Manager department resolution
      mockPrisma.department.findFirst.mockResolvedValue({
        id: 'dept-tech',
        name: 'Phòng Công Nghệ',
        code: 'TECH',
      });

      // 2. Team members
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          employeeCode: 'EMP-001',
          firstName: 'An',
          lastName: 'Nguyễn',
          avatarUrl: null,
          status: 'ACTIVE',
          position: { title: 'Lập trình viên' },
        },
        {
          id: 'emp-2',
          employeeCode: 'EMP-002',
          firstName: 'Bình',
          lastName: 'Trần',
          avatarUrl: null,
          status: 'ACTIVE',
          position: { title: 'QA Engineer' },
        },
        {
          id: 'emp-3',
          employeeCode: 'EMP-003',
          firstName: 'Cường',
          lastName: 'Lê',
          avatarUrl: null,
          status: 'ACTIVE',
          position: { title: 'DevOps' },
        },
      ]);

      // 3. Team attendance today
      mockPrisma.attendance.findMany.mockImplementation((args: any) => {
        // Today attendance
        if (args?.where?.workDate?.gte && args?.where?.workDate?.lte) {
          return Promise.resolve([
            {
              employeeId: 'emp-1',
              checkInTime: new Date(),
              checkOutTime: null,
              lateMinutes: 0,
              actualWorkHours: 4,
              status: 'PRESENT',
            },
            {
              employeeId: 'emp-2',
              checkInTime: new Date(),
              checkOutTime: null,
              lateMinutes: 20,
              actualWorkHours: 3.5,
              status: 'LATE',
            },
          ]);
        }
        return Promise.resolve([]);
      });

      // 4. Team leaves today
      mockPrisma.leaveRequest.findMany.mockImplementation((args: any) => {
        if (args?.where?.status === 'APPROVED') {
          return Promise.resolve([
            { employeeId: 'emp-3' }, // emp-3 is on leave
          ]);
        }
        // Approval queue: pending leaves
        return Promise.resolve([
          {
            id: 'lr-1',
            employee: { firstName: 'An', lastName: 'Nguyễn', employeeCode: 'EMP-001' },
            requestType: 'LEAVE',
            startDate: new Date('2026-09-10'),
            endDate: new Date('2026-09-11'),
            durationDays: 2,
            reason: 'Nghỉ cá nhân',
            createdAt: new Date(),
          },
        ]);
      });

      // 5. Attendance weekly count & adjustments queue
      mockPrisma.attendance.count.mockResolvedValue(3); // 3 late instances this week
      mockPrisma.attendanceAdjustment.findMany.mockResolvedValue([
        {
          id: 'adj-1',
          employee: { firstName: 'Bình', lastName: 'Trần', employeeCode: 'EMP-002' },
          workDate: new Date('2026-09-02'),
          correctionType: 'CHECK_IN_OUT',
          reason: 'Quên chấm công máy quét lỗi',
          createdAt: new Date(),
        },
      ]);

      // 6. Team KPI results
      mockPrisma.employeeKpiResult.findMany.mockImplementation((args: any) => {
        if (args?.include?.kpi) {
          // Approval queue
          return Promise.resolve([
            {
              id: 'kpi-res-1',
              employee: { firstName: 'An', lastName: 'Nguyễn', employeeCode: 'EMP-001' },
              kpi: { title: 'Sprint Velocity' },
              period: '2026-09',
              actualValue: 95,
              targetValue: 100,
              completionRate: 95,
            },
          ]);
        }
        // Scorecard
        return Promise.resolve([
          { weightedScore: 92, completionRate: 95, status: 'SUBMITTED' },
          { weightedScore: 88, completionRate: 88, status: 'APPROVED' },
          { weightedScore: 105, completionRate: 105, status: 'APPROVED' },
        ]);
      });

      // 7. Bonus / Penalty queue
      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([
        {
          id: 'bp-1',
          employee: { firstName: 'An', lastName: 'Nguyễn', employeeCode: 'EMP-001' },
          type: 'BONUS',
          amount: 2000000,
          reason: 'Dự án hoàn thành sớm',
          period: '2026-09',
        },
      ]);

      const result = await DashboardService.getManagerDashboard(managerSession);

      // Verify Team Attendance
      expect(result.teamAttendance.totalMembers).toBe(3);
      expect(result.teamAttendance.presentToday).toBe(2);
      expect(result.teamAttendance.absentToday).toBe(0); // 1 is on approved leave, 2 are present
      expect(result.teamAttendance.attendanceRate).toBe(67); // 2/3 = 67%

      // Verify Lateness
      expect(result.lateness.lateTodayCount).toBe(1);
      expect(result.lateness.totalLateMinutesToday).toBe(20);
      expect(result.lateness.weeklyLateCount).toBe(3);

      // Verify KPI
      expect(result.kpi.averageScore).toBe(95); // (92+88+105)/3 = 95
      expect(result.kpi.averageCompletionRate).toBe(96); // (95+88+105)/3 = 96
      expect(result.kpi.pendingEvaluationCount).toBe(1);
      expect(result.kpi.approvedCount).toBe(2);

      // Verify Approval Queue
      expect(result.approvalQueue.totalQueueCount).toBe(4);
      expect(result.approvalQueue.pendingLeaves).toHaveLength(1);
      expect(result.approvalQueue.pendingAttendance).toHaveLength(1);
      expect(result.approvalQueue.pendingKpi).toHaveLength(1);
      expect(result.approvalQueue.pendingBonusPenalty).toHaveLength(1);

      // Verify Team Members detail list
      expect(result.teamMembers).toHaveLength(3);
      expect(result.teamMembers[0].todayStatus).toBe('PRESENT');
      expect(result.teamMembers[1].todayStatus).toBe('LATE');
      expect(result.teamMembers[2].todayStatus).toBe('ON_LEAVE');

      // Verify KPI Distribution
      expect(result.charts.kpiDistribution.exceeding).toBe(1); // 105%
      expect(result.charts.kpiDistribution.meeting).toBe(2); // 95%, 88%
      expect(result.charts.kpiDistribution.needsImprovement).toBe(0);
    });
  });

  // ── 3. Employee Dashboard Tests ──────────────────────────────────────────
  describe('Employee Dashboard (getEmployeeDashboard)', () => {
    it('returns personal attendance, work hours, leaves, KPI, salary, and notifications', async () => {
      // 1. Employee Record
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-dev-1',
        employeeCode: 'EMP-0004',
        firstName: 'An',
        lastName: 'Phạm',
        contractSalary: 22000000,
        hourlyRate: 125000,
        department: { name: 'Phòng Công Nghệ' },
        position: { title: 'Middle Software Engineer' },
      });

      // 2. Today's attendance
      mockPrisma.attendance.findFirst.mockImplementation((args: any) => {
        // Today check
        if (args?.select?.actualWorkHours) {
          return Promise.resolve({ actualWorkHours: 8, otHours: 1 });
        }
        return Promise.resolve({
          id: 'att-today',
          checkInTime: new Date('2026-09-04T08:05:00Z'),
          checkOutTime: null,
          checkInMethod: 'QR',
          status: 'PRESENT',
          lateMinutes: 5,
          earlyMinutes: 0,
          actualWorkHours: 4.5,
          otHours: 0,
        });
      });

      // 3. Month work hours aggregation
      mockPrisma.attendance.aggregate.mockResolvedValue({
        _sum: {
          actualWorkHours: 154,
          otHours: 12,
        },
      });

      // 4. Approved leaves this year
      mockPrisma.leaveRequest.findMany.mockImplementation((args: any) => {
        if (args?.where?.status === 'APPROVED') {
          return Promise.resolve([
            { durationDays: 1 },
            { durationDays: 2.5 },
          ]);
        }
        // Recent leaves
        return Promise.resolve([
          {
            id: 'lr-emp-1',
            requestType: 'LEAVE',
            startDate: new Date('2026-08-15'),
            endDate: new Date('2026-08-16'),
            durationDays: 1,
            status: 'APPROVED',
            reason: 'Khám sức khỏe',
          },
        ]);
      });
      mockPrisma.leaveRequest.count.mockResolvedValue(1);

      // 5. KPIs
      mockPrisma.employeeKpiResult.findMany.mockResolvedValue([
        {
          id: 'kpi-1',
          targetValue: 10,
          actualValue: 9,
          completionRate: 90,
          score: 90,
          weightedScore: 90,
          bonusAmount: 1500000,
          status: 'SUBMITTED',
          kpi: { title: 'Tasks Completed', unit: 'TASKS', targetValue: 10 },
        },
      ]);

      // 6. Latest Payroll & Payslip
      mockPrisma.payroll.findFirst.mockResolvedValue({
        id: 'pay-sep',
        contractSalary: 22000000,
        otPay: 1200000,
        kpiBonus: 1500000,
        otherBonuses: 0,
        grossIncome: 24700000,
        socialInsurance: 1760000,
        healthInsurance: 330000,
        unemploymentInsurance: 220000,
        pitTax: 1200000,
        totalPenalties: 0,
        netSalary: 21190000,
        paymentStatus: 'PAID',
        period: {
          code: 'PAY-2026-08',
          name: 'Kỳ Lương Tháng 08/2026',
        },
      });

      // 7. Notifications
      mockPrisma.notification.count.mockResolvedValue(2);
      mockPrisma.notification.findMany.mockResolvedValue([
        {
          id: 'notif-1',
          title: 'Đã nhận phiếu lương',
          message: 'Phiếu lương tháng 08/2026 đã sẵn sàng để tải về.',
          type: 'PAYROLL',
          actionUrl: '/my-payslips',
          isRead: false,
          createdAt: new Date(),
        },
        {
          id: 'notif-2',
          title: 'Chấm công thành công',
          message: 'Bạn đã check-in qua QR lúc 08:05.',
          type: 'ATTENDANCE',
          actionUrl: null,
          isRead: true,
          createdAt: new Date(),
        },
      ]);

      const result = await DashboardService.getEmployeeDashboard(employeeSession);

      // Check Employee Identity
      expect(result.employee.fullName).toBe('Phạm An');
      expect(result.employee.employeeCode).toBe('EMP-0004');

      // Check Today's Attendance
      expect(result.todayAttendance.status).toBe('PRESENT');
      expect(result.todayAttendance.statusLabel).toContain('Đang làm việc');
      expect(result.todayAttendance.lateMinutes).toBe(5);

      // Check Working Hours & OT
      expect(result.workingHours.monthTotalHours).toBe(154);
      expect(result.workingHours.standardMonthHours).toBe(176);
      expect(result.workingHours.completionPercentage).toBe(88); // 154/176 = 88%
      expect(result.overtime.monthTotalOtHours).toBe(12);

      // Check Leaves
      expect(result.leave.usedDays).toBe(3.5);
      expect(result.leave.remainingDays).toBe(8.5); // 12 - 3.5 = 8.5
      expect(result.leave.pendingRequests).toBe(1);

      // Check KPI
      expect(result.kpi.overallScore).toBe(90);
      expect(result.kpi.items).toHaveLength(1);
      expect(result.kpi.items[0].title).toBe('Tasks Completed');

      // Check Salary & Payslip
      expect(result.salary.contractSalary).toBe(22000000);
      expect(result.payslip?.payrollId).toBe('pay-sep');
      expect(result.payslip?.netSalary).toBe(21190000);
      expect(result.payslip?.paymentStatus).toBe('PAID');
      expect(result.payslip?.downloadPdfUrl).toBe('/api/v1/payroll/payslips/pay-sep/pdf');

      // Check Notifications
      expect(result.notifications.unreadCount).toBe(2);
      expect(result.notifications.items).toHaveLength(2);

      // Check Chart data
      expect(result.charts.workHours14Days).toHaveLength(14);
      expect(result.charts.salaryComposition.netSalary).toBe(21190000);
    });
  });

  // ── 4. Notification Management ───────────────────────────────────────────
  describe('Notification Management (markNotificationAsRead)', () => {
    it('marks a single notification or all notifications as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const count1 = await DashboardService.markNotificationAsRead('usr-emp', 'notif-1');
      expect(count1).toBe(1);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'usr-emp' },
        data: { isRead: true },
      });

      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });
      const countAll = await DashboardService.markNotificationAsRead('usr-emp');
      expect(countAll).toBe(5);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr-emp', isRead: false },
        data: { isRead: true },
      });
    });
  });

  // ── 5. Edge Cases & Empty Data Handling ──────────────────────────────────
  describe('Edge Cases & Zero Records Resilience', () => {
    it('handles empty database gracefully without NaN or runtime exceptions for Admin', async () => {
      mockPrisma.employee.count.mockResolvedValue(0);
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
      mockPrisma.leaveRequest.count.mockResolvedValue(0);
      mockPrisma.attendanceAdjustment.count.mockResolvedValue(0);
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue(null);
      mockPrisma.attendance.aggregate.mockResolvedValue({ _sum: { otHours: null } });
      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([]);
      mockPrisma.department.findMany.mockResolvedValue([]);

      const result = await DashboardService.getAdminHrDashboard(adminSession);

      expect(result.totalEmployees).toBe(0);
      expect(result.presentToday).toBe(0);
      expect(result.absentToday).toBe(0);
      expect(result.lateToday).toBe(0);
      expect(result.payrollStatus.status).toBe('NO_PERIOD');
      expect(result.overtime.todayHours).toBe(0);
      expect(result.overtime.monthHours).toBe(0);
      expect(result.bonus.totalAmount).toBe(0);
      expect(result.penalty.totalAmount).toBe(0);
      expect(result.charts.attendanceTrend).toHaveLength(7);
      expect(result.charts.departmentDistribution).toHaveLength(0);
    });

    it('handles manager with no department assigned by gracefully defaulting', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null);
      mockPrisma.department.findUnique.mockResolvedValue(null);

      const emptyManagerSession: UserSession = {
        userId: 'usr-unassigned',
        employeeId: 'emp-unassigned',
        fullName: 'Unassigned Manager',
        email: 'unassigned@antigravity.internal',
        roles: ['manager'],
        permissions: [],
        isActive: true,
      };

      const result = await DashboardService.getManagerDashboard(emptyManagerSession);

      expect(result.department).toBeNull();
      expect(result.teamAttendance.totalMembers).toBe(0);
      expect(result.teamAttendance.attendanceRate).toBe(0);
      expect(result.approvalQueue.totalQueueCount).toBe(0);
      expect(result.teamMembers).toHaveLength(0);
    });

    it('handles employee with zero attendance and zero payroll smoothly', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-fresh',
        employeeCode: 'EMP-9999',
        firstName: 'Mới',
        lastName: 'Nhân Viên',
        contractSalary: 15000000,
        hourlyRate: 85000,
        department: null,
        position: null,
      });

      mockPrisma.attendance.findFirst.mockResolvedValue(null);
      mockPrisma.attendance.aggregate.mockResolvedValue({ _sum: { actualWorkHours: null, otHours: null } });
      mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
      mockPrisma.leaveRequest.count.mockResolvedValue(0);
      mockPrisma.employeeKpiResult.findMany.mockResolvedValue([]);
      mockPrisma.payroll.findFirst.mockResolvedValue(null);
      mockPrisma.notification.count.mockResolvedValue(0);
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const freshSession: UserSession = {
        userId: 'usr-fresh',
        employeeId: 'emp-fresh',
        fullName: 'Nhân Viên Mới',
        email: 'fresh@antigravity.internal',
        roles: ['employee'],
        permissions: [],
        isActive: true,
      };

      const result = await DashboardService.getEmployeeDashboard(freshSession);

      expect(result.todayAttendance.status).toBe('NOT_CHECKED_IN');
      expect(result.todayAttendance.statusLabel).toBe('Chưa check-in');
      expect(result.todayAttendance.actualWorkHours).toBe(0);
      expect(result.workingHours.monthTotalHours).toBe(0);
      expect(result.leave.usedDays).toBe(0);
      expect(result.leave.remainingDays).toBe(12);
      expect(result.kpi.status).toBe('NO_DATA');
      expect(result.payslip).toBeNull();
      expect(result.notifications.unreadCount).toBe(0);
      expect(result.charts.workHours14Days).toHaveLength(14);
    });
  });
});
