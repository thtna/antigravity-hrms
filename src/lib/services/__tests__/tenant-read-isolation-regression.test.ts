import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserSession } from '@/types';

const mockAuth = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  workShift: { findMany: vi.fn(), findFirst: vi.fn() },
  position: { findMany: vi.fn(), findFirst: vi.fn() },
  department: { findMany: vi.fn(), findFirst: vi.fn() },
  employee: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  worksite: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  kpi: { findMany: vi.fn(), count: vi.fn() },
  employeeKpiResult: { findMany: vi.fn(), count: vi.fn() },
  auditLog: { findMany: vi.fn(), count: vi.fn() },
  payrollRule: { findMany: vi.fn(), findFirst: vi.fn() },
  attendanceAdjustment: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
  employeeSchedule: { findMany: vi.fn() },
  recurringSchedule: { findMany: vi.fn() },
  qrAttendanceToken: { findMany: vi.fn(), count: vi.fn() },
  payrollPeriod: { findFirst: vi.fn() },
  payrollApproval: { findMany: vi.fn() },
  payrollAdjustment: { findMany: vi.fn() },
  payroll: { findFirst: vi.fn() },
  attendance: { findFirst: vi.fn() },
  leaveRequest: { findFirst: vi.fn() },
  employeeBonusPenalty: { findFirst: vi.fn() },
}));

vi.mock('@/lib/auth/guard', () => ({ requireAuth: mockAuth }));
vi.mock('@/lib/db/prisma', () => ({ prisma: db }));

import { GET as listShifts } from '@/app/api/v1/shifts/route';
import { GET as getShift } from '@/app/api/v1/shifts/[id]/route';
import { GET as listPositions } from '@/app/api/v1/positions/route';
import { GET as getPosition } from '@/app/api/v1/positions/[id]/route';
import { GET as getDepartment } from '@/app/api/v1/departments/[id]/route';
import { GET as getDepartmentEmployees } from '@/app/api/v1/departments/[id]/employees/route';
import { GET as listKpis } from '@/app/api/v1/kpi/definitions/route';
import { GET as reportMeta } from '@/app/api/v1/reports/meta/route';
import { AuditService } from '@/lib/services/audit.service';
import { WorksiteService } from '@/lib/services/worksite.service';
import { PayrollRuleService } from '@/lib/services/payroll-rule.service';
import { KpiService } from '@/lib/services/kpi.service';
import { AttendanceCorrectionService } from '@/lib/services/attendance-correction.service';
import { ScheduleService } from '@/lib/services/schedule.service';
import { QrAttendanceService } from '@/lib/services/qr-attendance.service';
import { PayrollWorkflowService } from '@/lib/services/payroll-workflow.service';
import { DashboardService } from '@/lib/services/dashboard.service';
import { EmployeeService } from '@/lib/services/employee.service';
import { AttendanceService } from '@/lib/services/attendance.service';
import { LeaveService } from '@/lib/services/leave.service';
import { BonusService } from '@/lib/services/bonus.service';
import { PenaltyService } from '@/lib/services/penalty.service';
import { PayrollService } from '@/lib/services/payroll.service';
import { PayslipService } from '@/lib/services/payslip.service';
import { DocumentService } from '@/lib/services/document.service';

const sessionA: UserSession = {
  userId: 'user-a', organizationId: 'org-a', email: 'a@example.test',
  fullName: 'Tenant A', roles: ['admin'], permissions: [], isActive: true,
};
const sessionB: UserSession = { ...sessionA, userId: 'user-b', organizationId: 'org-b' };
const request = (path: string) => new NextRequest(`http://localhost${path}`);
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue(sessionA);
});

describe('authenticated tenant reads never become global reads', () => {
  it('returns only the caller tenant shifts from the real list handler', async () => {
    const rows = ['org-a', 'org-b'].map((organizationId) => ({
      id: `shift-${organizationId}`, organizationId, standardWorkHours: 8,
      effectiveFrom: new Date('2026-01-01'), effectiveTo: null,
      _count: { schedules: 0, recurringSchedules: 0 },
    }));
    db.workShift.findMany.mockImplementation(async ({ where }) =>
      rows.filter((row) => row.organizationId === where.organizationId)
    );

    const responseA = await listShifts(request('/api/v1/shifts?includeInactive=true'));
    expect(responseA.status).toBe(200);
    expect((await responseA.json()).data.map((row: { id: string }) => row.id)).toEqual(['shift-org-a']);
    expect(db.workShift.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    }));

    mockAuth.mockResolvedValue(sessionB);
    const responseB = await listShifts(request('/api/v1/shifts?includeInactive=true'));
    expect((await responseB.json()).data.map((row: { id: string }) => row.id)).toEqual(['shift-org-b']);
  });

  it('denies a foreign shift ID in the database query', async () => {
    db.workShift.findFirst.mockResolvedValue(null);
    const response = await getShift(request('/api/v1/shifts/shift-b'), params('shift-b'));
    expect(response.status).toBe(404);
    expect(db.workShift.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'shift-b', organizationId: 'org-a', deletedAt: null },
    }));
  });

  it('returns only caller tenant positions', async () => {
    const rows = ['org-a', 'org-b'].map((organizationId) => ({
      id: `position-${organizationId}`, organizationId,
      baseSalaryGrade: 1, minSalary: 1, maxSalary: 1, _count: { employees: 0 },
    }));
    db.position.findMany.mockImplementation(async ({ where }) =>
      rows.filter((row) => row.organizationId === where.organizationId)
    );
    const response = await listPositions(request('/api/v1/positions?includeInactive=true'));
    expect(response.status).toBe(200);
    expect((await response.json()).data.map((row: { id: string }) => row.id)).toEqual(['position-org-a']);
  });

  it('denies foreign position and department detail, including department employees', async () => {
    db.position.findFirst.mockResolvedValue(null);
    db.department.findFirst.mockResolvedValue(null);
    expect((await getPosition(request('/api/v1/positions/pos-b'), params('pos-b'))).status).toBe(404);
    expect((await getDepartment(request('/api/v1/departments/dept-b'), params('dept-b'))).status).toBe(404);
    expect((await getDepartmentEmployees(request('/api/v1/departments/dept-b/employees'), params('dept-b'))).status).toBe(404);
    expect(db.position.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pos-b', deletedAt: null, organizationId: 'org-a' },
    }));
    expect(db.department.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'dept-b', deletedAt: null, organizationId: 'org-a' },
    }));
  });

  it('scopes KPI definitions, report metadata, audit logs and KPI summary', async () => {
    db.kpi.count.mockResolvedValue(0);
    db.kpi.findMany.mockResolvedValue([]);
    db.department.findMany.mockResolvedValue([]);
    db.employee.findMany.mockResolvedValue([]);
    db.auditLog.count.mockResolvedValue(0);
    db.auditLog.findMany.mockResolvedValue([]);
    db.employeeKpiResult.count.mockResolvedValue(0);
    db.employeeKpiResult.findMany.mockResolvedValue([]);

    expect((await listKpis(request('/api/v1/kpi/definitions'))).status).toBe(200);
    expect(db.kpi.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    }));
    expect((await reportMeta(request('/api/v1/reports/meta'))).status).toBe(200);
    expect(db.department.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-a' } }));
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-a' } }));

    await AuditService.getAuditLogs({ page: 1, limit: 20 }, sessionA);
    expect(db.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    }));
    await KpiService.getKpiDashboardSummary(sessionA);
    expect(db.kpi.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    }));
    expect(db.employeeKpiResult.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    }));
  });

  it('scopes worksite and payroll-rule lists and foreign IDs', async () => {
    db.worksite.count.mockResolvedValue(0);
    db.worksite.findMany.mockResolvedValue([]);
    db.worksite.findFirst.mockResolvedValue(null);
    db.payrollRule.findMany.mockResolvedValue([]);
    db.payrollRule.findFirst.mockResolvedValue(null);
    await WorksiteService.getWorksites({ isActive: 'ALL', page: 1, limit: 20 }, sessionA);
    expect(db.worksite.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    }));
    await expect(WorksiteService.getWorksiteById('ws-b', sessionA)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.worksite.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ws-b', organizationId: 'org-a' } }));
    await PayrollRuleService.listRules(sessionA);
    expect(db.payrollRule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-a' } }));
    await expect(PayrollRuleService.getRuleById('rule-b', sessionA)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.payrollRule.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rule-b', organizationId: 'org-a' } }));
  });

  it('scopes attendance corrections, schedules and QR history', async () => {
    db.attendanceAdjustment.count.mockResolvedValue(0);
    db.attendanceAdjustment.findMany.mockResolvedValue([]);
    db.employeeSchedule.findMany.mockResolvedValue([]);
    db.recurringSchedule.findMany.mockResolvedValue([]);
    db.qrAttendanceToken.count.mockResolvedValue(0);
    db.qrAttendanceToken.findMany.mockResolvedValue([]);
    await AttendanceCorrectionService.listCorrections({ page: 1, limit: 20, status: 'ALL' }, sessionA);
    expect(db.attendanceAdjustment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    }));
    await ScheduleService.querySchedules({ status: 'ALL' }, sessionA);
    expect(db.employeeSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    }));
    await ScheduleService.getRecurringPatterns('employee-b', sessionA);
    expect(db.recurringSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    }));
    await QrAttendanceService.queryTokens({ page: 1, limit: 20, isUsed: 'ALL' }, sessionA);
    expect(db.qrAttendanceToken.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    }));
  });

  it('rejects foreign payroll workflow periods before reading approvals or adjustments', async () => {
    db.payrollPeriod.findFirst.mockResolvedValue(null);
    await expect(PayrollWorkflowService.getApprovalHistory('period-b', sessionA)).rejects.toMatchObject({ statusCode: 404 });
    await expect(PayrollWorkflowService.listAdjustments('period-b', sessionA)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.payrollPeriod.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'period-b', organizationId: 'org-a' },
    }));
    expect(db.payrollApproval.findMany).not.toHaveBeenCalled();
    expect(db.payrollAdjustment.findMany).not.toHaveBeenCalled();
  });

  it('fails closed for a session without an organization', async () => {
    const orglessSession = { ...sessionA, organizationId: null };
    await expect(DashboardService.getEmployeeDashboard(orglessSession)).rejects.toMatchObject({ statusCode: 403 });
    expect(db.employee.findFirst).not.toHaveBeenCalled();
  });

  it('scopes every affected single-resource query before loading foreign data', async () => {
    db.employee.findFirst.mockResolvedValue(null);
    db.attendance.findFirst.mockResolvedValue(null);
    db.attendanceAdjustment.findFirst.mockResolvedValue(null);
    db.leaveRequest.findFirst.mockResolvedValue(null);
    db.employeeBonusPenalty.findFirst.mockResolvedValue(null);
    db.payrollPeriod.findFirst.mockResolvedValue(null);
    db.payroll.findFirst.mockResolvedValue(null);
    db.employeeKpiResult.findMany.mockResolvedValue([]);

    const lookups = [
      () => EmployeeService.getEmployeeById('foreign', sessionA),
      () => AttendanceService.getAttendanceById('foreign', sessionA),
      () => AttendanceCorrectionService.getCorrectionById('foreign', sessionA),
      () => LeaveService.getLeaveRequestById('foreign', sessionA),
      () => BonusService.getBonusById('foreign', sessionA),
      () => PenaltyService.getPenaltyById('foreign', sessionA),
      () => PayrollService.getPeriodDetail('foreign', sessionA),
      () => PayrollService.getPayslipDetail('foreign', sessionA),
      () => PayslipService.getPayslipForPdf('foreign', sessionA),
      () => DocumentService.listEmployeeDocuments('foreign', sessionA),
      () => DocumentService.downloadEmployeeDocument('foreign', 'doc', sessionA),
      () => DocumentService.getEmployeeDocumentSignedUrl('foreign', 'doc', sessionA),
      () => KpiService.getEmployeeScorecard('foreign', '2026-09', sessionA),
    ];
    for (const lookup of lookups) {
      await expect(lookup()).rejects.toMatchObject({ statusCode: 404 });
    }
    const scopedModels = [db.employee, db.attendance, db.attendanceAdjustment,
      db.leaveRequest, db.employeeBonusPenalty, db.payrollPeriod, db.payroll];
    for (const model of scopedModels) {
      expect(model.findFirst).toHaveBeenCalled();
      expect(model.findFirst.mock.calls.every(([arg]) =>
        arg.where.organizationId === 'org-a' || arg.where.employee?.organizationId === 'org-a'
      )).toBe(true);
    }
    expect(db.employeeKpiResult.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: 'org-a' }),
    }));
  });
});
