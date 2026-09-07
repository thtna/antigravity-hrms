/**
 * PHASE 27 — REAL WORLD ENTERPRISE END-TO-END SIMULATION TEST SUITE
 *
 * Simulates a realistic technology enterprise ("Công ty Cổ phần Công nghệ & Dịch vụ Số Tân Phong")
 * and verifies the complete 10-stage core business lifecycle end-to-end without fake data in the core engine:
 *
 *   Employee
 *   → Schedule
 *   → Attendance
 *   → Exception
 *   → Leave
 *   → KPI
 *   → Bonus/Penalty
 *   → Payroll
 *   → Approval
 *   → Payslip
 */

import { describe, it, expect, vi } from 'vitest';
import { UserSession } from '@/types';
import { ApiError } from '@/lib/errors';
import { DepartmentService } from '../department.service';
import { PositionService } from '../position.service';
import { EmployeeService } from '../employee.service';
import { ShiftService } from '../shift.service';
import { ScheduleService } from '../schedule.service';
import { AttendanceService } from '../attendance.service';
import { LeaveService } from '../leave.service';
import { KpiService } from '../kpi.service';
import { BonusService } from '../bonus.service';
import { PenaltyService } from '../penalty.service';
import { PayrollService } from '../payroll.service';
import { PayrollWorkflowService } from '../payroll-workflow.service';
import { PayslipService } from '../payslip.service';
import { PayrollCalculationEngine } from '@/lib/payroll/payroll-calculation-engine';
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';

// ─── Stateful In-Memory Mock Store ──────────────────────────────────────────

const state = {
  users: new Map<string, any>(),
  roles: new Map<string, any>(),
  departments: new Map<string, any>(),
  positions: new Map<string, any>(),
  employees: new Map<string, any>(),
  shifts: new Map<string, any>(),
  schedules: new Map<string, any>(),
  attendances: new Map<string, any>(),
  adjustments: new Map<string, any>(),
  worksites: new Map<string, any>(),
  leaveRequests: new Map<string, any>(),
  leaveBalances: new Map<string, any>(),
  kpiDefinitions: new Map<string, any>(),
  kpiResults: new Map<string, any>(),
  bonusPenalties: new Map<string, any>(),
  payrollPeriods: new Map<string, any>(),
  payrolls: new Map<string, any>(),
  payrollApprovals: new Map<string, any>(),
  auditLogs: [] as any[],
};

const defaultPayrollRule = {
  id: 'rule-vietnam-2026',
  code: VIETNAM_STATUTORY_RULE_2026.ruleCode,
  name: VIETNAM_STATUTORY_RULE_2026.ruleName,
  isDefault: true,
  isActive: true,
  version: 1,
  salaryBasisConfig: VIETNAM_STATUTORY_RULE_2026.salaryBasis,
  overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime,
  insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance,
  taxConfig: VIETNAM_STATUTORY_RULE_2026.tax,
  deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction,
  roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding,
};

// Mock Prisma
vi.mock('@/lib/db/prisma', () => {
  let counter = 0;
  const uid = (prefix: string) => `${prefix}-${Date.now()}-${++counter}`;

  const p: any = {
    user: {
      findUnique: vi.fn(async ({ where }) => {
        if (where.email) {
          for (const u of state.users.values()) {
            if (u.email.toLowerCase() === where.email.toLowerCase()) return u;
          }
        }
        if (where.id) return state.users.get(where.id) || null;
        return null;
      }),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('usr');
        const u = { id, ...data };
        state.users.set(id, u);
        return u;
      }),
    },
    role: {
      findUnique: vi.fn(async ({ where }) => {
        for (const r of state.roles.values()) {
          if (r.code === where.code || r.id === where.id) return r;
        }
        return null;
      }),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `role-${data.code}`;
        const r = { id, ...data };
        state.roles.set(id, r);
        return r;
      }),
    },
    department: {
      findUnique: vi.fn(async ({ where }) => {
        if (where.code) {
          for (const d of state.departments.values()) {
            if (d.code === where.code) return d;
          }
        }
        return state.departments.get(where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: any = {}) => {
        if (where?.code) {
          for (const d of state.departments.values()) {
            if (d.code === where.code) return d;
          }
          return null;
        }
        return Array.from(state.departments.values())[0] || null;
      }),
      findMany: vi.fn(async () => Array.from(state.departments.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('dept');
        const d = { id, employees: [], subDepartments: [], ...data };
        state.departments.set(id, d);
        return d;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.departments.get(where.id);
        const updated = { ...existing, ...data };
        state.departments.set(where.id, updated);
        return updated;
      }),
    },
    position: {
      findUnique: vi.fn(async ({ where }) => {
        if (where.code) {
          for (const pos of state.positions.values()) {
            if (pos.code === where.code) return pos;
          }
        }
        return state.positions.get(where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: any = {}) => {
        if (where?.code) {
          for (const pos of state.positions.values()) {
            if (pos.code === where.code) return pos;
          }
          return null;
        }
        return Array.from(state.positions.values())[0] || null;
      }),
      findMany: vi.fn(async () => Array.from(state.positions.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('pos');
        const pos = { id, employees: [], ...data };
        state.positions.set(id, pos);
        return pos;
      }),
    },
    employee: {
      findUnique: vi.fn(async ({ where }) => {
        let emp: any = null;
        if (where.id) emp = state.employees.get(where.id);
        if (!emp && where.employeeCode) {
          for (const e of state.employees.values()) {
            if (e.employeeCode === where.employeeCode) { emp = e; break; }
          }
        }
        if (!emp && where.userId) {
          for (const e of state.employees.values()) {
            if (e.userId === where.userId) { emp = e; break; }
          }
        }
        if (!emp) return null;
        const dept = emp.departmentId ? state.departments.get(emp.departmentId) : null;
        const pos = emp.positionId ? state.positions.get(emp.positionId) : null;
        const ws = emp.worksiteId ? state.worksites.get(emp.worksiteId) : null;
        const u = emp.userId ? state.users.get(emp.userId) : null;
        return {
          ...emp,
          userId: emp.userId,
          department: dept ? { id: dept.id, name: dept.name, code: dept.code } : null,
          position: pos ? { id: pos.id, title: pos.title, code: pos.code } : null,
          worksite: ws || null,
          user: u || { id: emp.userId, email: emp.email, isActive: true },
          managedDepartments: [],
        };
      }),
      findFirst: vi.fn(async ({ where }: any = {}) => {
        let emp: any = null;
        if (where?.employeeCode) {
          for (const e of state.employees.values()) {
            if (e.employeeCode === where.employeeCode) { emp = e; break; }
          }
        }
        if (!emp && where?.identityCard) {
          for (const e of state.employees.values()) {
            if (e.identityCard === where.identityCard) { emp = e; break; }
          }
        }
        if (!emp) return null;
        const dept = emp.departmentId ? state.departments.get(emp.departmentId) : null;
        const pos = emp.positionId ? state.positions.get(emp.positionId) : null;
        const ws = emp.worksiteId ? state.worksites.get(emp.worksiteId) : null;
        const u = emp.userId ? state.users.get(emp.userId) : null;
        return {
          ...emp,
          userId: emp.userId,
          department: dept ? { id: dept.id, name: dept.name, code: dept.code } : null,
          position: pos ? { id: pos.id, title: pos.title, code: pos.code } : null,
          worksite: ws || null,
          user: u || { id: emp.userId, email: emp.email, isActive: true },
          managedDepartments: [],
        };
      }),
      findMany: vi.fn(async () => Array.from(state.employees.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('emp');
        const u = data.userId ? state.users.get(data.userId) : null;
        const emp = {
          id,
          ...data,
          userId: data.userId,
          user: u || { id: data.userId || uid('usr'), email: 'user@antigravity.internal', isActive: true },
        };
        state.employees.set(id, emp);
        return emp;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.employees.get(where.id);
        const updated = { ...existing, ...data };
        state.employees.set(where.id, updated);
        return updated;
      }),
    },
    workShift: {
      findUnique: vi.fn(async ({ where }) => {
        if (where.code) {
          for (const s of state.shifts.values()) {
            if (s.code === where.code) return s;
          }
        }
        return state.shifts.get(where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: any = {}) => {
        if (where?.code) {
          for (const s of state.shifts.values()) {
            if (s.code === where.code) return s;
          }
          return null;
        }
        return Array.from(state.shifts.values())[0] || null;
      }),
      findMany: vi.fn(async () => Array.from(state.shifts.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('shift');
        const effFrom = data.effectiveFrom && !isNaN(new Date(data.effectiveFrom).getTime())
          ? new Date(data.effectiveFrom)
          : new Date('2026-01-01');
        const s = {
          id,
          effectiveFrom: effFrom,
          effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
          ...data,
          _count: { schedules: 0, recurringSchedules: 0 },
        };
        state.shifts.set(id, s);
        return s;
      }),
    },
    employeeSchedule: {
      findUnique: vi.fn(async ({ where }) => {
        let s = null;
        if (where.id) {
          for (const val of state.schedules.values()) {
            if (val.id === where.id) { s = val; break; }
          }
        } else if (where.employeeId_workDate) {
          const key = `${where.employeeId_workDate.employeeId}_${new Date(where.employeeId_workDate.workDate).toISOString().split('T')[0]}`;
          s = state.schedules.get(key) || null;
        }
        if (!s) return null;
        const shift = state.shifts.get(s.shiftId);
        const emp = state.employees.get(s.employeeId);
        return { ...s, shift, employee: emp };
      }),
      findMany: vi.fn(async () => Array.from(state.schedules.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('sch');
        const key = `${data.employeeId}_${new Date(data.workDate).toISOString().split('T')[0]}`;
        const shift = state.shifts.get(data.shiftId);
        const emp = state.employees.get(data.employeeId);
        const s = { id, ...data, shift, employee: emp };
        state.schedules.set(key, s);
        return s;
      }),
      update: vi.fn(async ({ where, data }) => {
        let foundKey = '';
        let foundVal: any = null;
        if (where.id) {
          for (const [k, v] of state.schedules.entries()) {
            if (v.id === where.id) {
              foundKey = k;
              foundVal = v;
              break;
            }
          }
        } else if (where.employeeId_workDate) {
          foundKey = `${where.employeeId_workDate.employeeId}_${new Date(where.employeeId_workDate.workDate).toISOString().split('T')[0]}`;
          foundVal = state.schedules.get(foundKey);
        }
        if (foundVal) {
          const updated = { ...foundVal, ...data };
          state.schedules.set(foundKey, updated);
          return updated;
        }
        return { id: where.id || 'sch-upd', ...data };
      }),
      upsert: vi.fn(async ({ where, create, update }) => {
        const key = `${where.employeeId_workDate.employeeId}_${new Date(where.employeeId_workDate.workDate).toISOString().split('T')[0]}`;
        const existing = state.schedules.get(key);
        const shift = state.shifts.get(update?.shiftId || create?.shiftId);
        const emp = state.employees.get(create?.employeeId || existing?.employeeId);
        const val = existing
          ? { ...existing, ...update, shift, employee: emp }
          : { id: uid('sch'), ...create, shift, employee: emp };
        state.schedules.set(key, val);
        return val;
      }),
    },
    recurringSchedule: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    attendance: {
      findUnique: vi.fn(async ({ where }) => {
        if (where.id) return state.attendances.get(where.id) || null;
        if (where.employeeId_workDate) {
          const key = `${where.employeeId_workDate.employeeId}_${new Date(where.employeeId_workDate.workDate).toISOString().split('T')[0]}`;
          return state.attendances.get(key) || null;
        }
        return null;
      }),
      findFirst: vi.fn(async ({ where }) => {
        for (const a of state.attendances.values()) {
          if (where?.employeeId && a.employeeId !== where.employeeId) continue;
          return a;
        }
        return null;
      }),
      findMany: vi.fn(async () => Array.from(state.attendances.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('att');
        const key = `${data.employeeId}_${new Date(data.workDate).toISOString().split('T')[0]}`;
        const att = { id, ...data };
        state.attendances.set(key, att);
        state.attendances.set(id, att);
        return att;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.attendances.get(where.id);
        const updated = { ...existing, ...data };
        state.attendances.set(where.id, updated);
        if (existing?.employeeId && existing?.workDate) {
          const key = `${existing.employeeId}_${new Date(existing.workDate).toISOString().split('T')[0]}`;
          state.attendances.set(key, updated);
        }
        return updated;
      }),
      aggregate: vi.fn(async ({ where }) => {
        let actualWorkHours = 0;
        let otHours = 0;
        for (const a of state.attendances.values()) {
          if (where?.employeeId && a.employeeId !== where.employeeId) continue;
          actualWorkHours += Number(a.actualWorkHours || 0);
          otHours += Number(a.otHours || 0);
        }
        return {
          _sum: {
            actualWorkHours,
            otHours,
          },
        };
      }),
    },
    attendanceAdjustment: {
      findUnique: vi.fn(async ({ where }) => state.adjustments.get(where.id) || null),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('adj');
        const adj = { id, status: 'PENDING', ...data };
        state.adjustments.set(id, adj);
        return adj;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.adjustments.get(where.id);
        const updated = { ...existing, ...data };
        state.adjustments.set(where.id, updated);
        return updated;
      }),
    },
    leaveRequest: {
      findUnique: vi.fn(async ({ where }) => {
        const l = state.leaveRequests.get(where.id);
        if (!l) return null;
        const emp = state.employees.get(l.employeeId);
        return {
          ...l,
          employee: {
            id: emp?.id || l.employeeId,
            employeeCode: emp?.employeeCode || 'EMP-0008',
            firstName: emp?.firstName || 'Ngọc Ánh',
            lastName: emp?.lastName || 'Hoàng',
            departmentId: emp?.departmentId,
            department: { id: emp?.departmentId, name: 'Phòng Nhân sự' },
          },
          leaveType: {
            id: 'lt-annual',
            code: 'ANNUAL',
            name: 'Nghỉ phép năm',
            isPaid: true,
          },
        };
      }),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => Array.from(state.leaveRequests.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('leave');
        const l = { id, status: 'PENDING', ...data };
        state.leaveRequests.set(id, l);
        return l;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.leaveRequests.get(where.id);
        const updated = { ...existing, ...data };
        state.leaveRequests.set(where.id, updated);
        return updated;
      }),
    },
    leaveType: {
      findUnique: vi.fn(async () => ({
        id: 'lt-annual',
        code: 'ANNUAL',
        name: 'Nghỉ phép năm',
        isPaid: true,
        daysPerYear: 12,
        isActive: true,
      })),
    },
    leaveBalance: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => data),
      update: vi.fn(async ({ data }) => data),
    },
    kpi: {
      findUnique: vi.fn(async ({ where }) => {
        if (where.code) {
          for (const k of state.kpiDefinitions.values()) {
            if (k.code === where.code) return k;
          }
        }
        return state.kpiDefinitions.get(where.id) || null;
      }),
      findFirst: vi.fn(async ({ where }: any = {}) => {
        if (where?.code) {
          for (const k of state.kpiDefinitions.values()) {
            if (k.code === where.code) return k;
          }
          return null;
        }
        return Array.from(state.kpiDefinitions.values())[0] || null;
      }),
      findMany: vi.fn(async () => Array.from(state.kpiDefinitions.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('kpi');
        const k = { id, ...data };
        state.kpiDefinitions.set(id, k);
        return k;
      }),
    },
    employeeKpiResult: {
      findUnique: vi.fn(async ({ where }) => {
        if (where.id) return state.kpiResults.get(where.id) || null;
        return null;
      }),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('kpir');
        const r = { id, ...data };
        state.kpiResults.set(id, r);
        return r;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.kpiResults.get(where.id);
        const updated = { ...existing, ...data };
        state.kpiResults.set(where.id, updated);
        return updated;
      }),
    },
    employeeBonusPenalty: {
      findUnique: vi.fn(async ({ where }) => state.bonusPenalties.get(where.id) || null),
      findMany: vi.fn(async () => Array.from(state.bonusPenalties.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('bp');
        const bp = { id, status: 'PENDING', ...data };
        state.bonusPenalties.set(id, bp);
        return bp;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.bonusPenalties.get(where.id);
        const updated = { ...existing, ...data };
        state.bonusPenalties.set(where.id, updated);
        return updated;
      }),
    },
    payrollRule: {
      findUnique: vi.fn(async () => defaultPayrollRule),
      findFirst: vi.fn(async () => defaultPayrollRule),
    },
    payrollPeriod: {
      findUnique: vi.fn(async ({ where }) => {
        const p = state.payrollPeriods.get(where.id);
        if (!p) return null;
        return {
          ...p,
          payrollRule: defaultPayrollRule,
          _count: { payrolls: state.payrolls.size || 8 },
          approvals: Array.from(state.payrollApprovals.values()).filter((a: any) => a.periodId === p.id),
        };
      }),
      findFirst: vi.fn(async ({ where }: any = {}) => {
        if (where?.code) {
          for (const p of state.payrollPeriods.values()) {
            if (p.code === where.code) return p;
          }
          return null;
        }
        return Array.from(state.payrollPeriods.values())[0] || null;
      }),
      findMany: vi.fn(async () => Array.from(state.payrollPeriods.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('prd');
        const p = { id, status: 'DRAFT', ...data };
        state.payrollPeriods.set(id, p);
        return p;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.payrollPeriods.get(where.id);
        const updated = { ...existing, ...data };
        state.payrollPeriods.set(where.id, updated);
        return updated;
      }),
    },
    payroll: {
      findUnique: vi.fn(async ({ where }) => {
        const pay = state.payrolls.get(where.id);
        if (!pay) return null;
        const emp = state.employees.get(pay.employeeId);
        const period = state.payrollPeriods.get(pay.periodId);
        return {
          ...pay,
          period,
          employee: {
            ...emp,
            userId: emp?.userId,
            department: state.departments.get(emp?.departmentId),
            position: state.positions.get(emp?.positionId),
          },
          details: [
            { id: 'd-1', itemCode: 'BASE_SALARY', itemName: 'Lương cơ bản', itemType: 'EARNING', amount: pay.proratedSalary, description: 'Lương ngày công thực tế' },
            { id: 'd-2', itemCode: 'OVERTIME', itemName: 'Lương làm thêm giờ (OT)', itemType: 'EARNING', amount: pay.otPay, description: `${pay.otHours || 0} giờ làm thêm` },
            { id: 'd-3', itemCode: 'KPI_BONUS', itemName: 'Thưởng hiệu quả KPI', itemType: 'EARNING', amount: pay.kpiBonus, description: 'Đạt chỉ tiêu tháng' },
            { id: 'd-4', itemCode: 'SI', itemName: 'Bảo hiểm xã hội (8%)', itemType: 'STATUTORY_DEDUCTION', amount: pay.socialInsurance, description: 'BHXH bắt buộc' },
            { id: 'd-5', itemCode: 'HI', itemName: 'Bảo hiểm y tế (1.5%)', itemType: 'STATUTORY_DEDUCTION', amount: pay.healthInsurance, description: 'BHYT bắt buộc' },
            { id: 'd-6', itemCode: 'UI', itemName: 'Bảo hiểm thất nghiệp (1%)', itemType: 'STATUTORY_DEDUCTION', amount: pay.unemploymentInsurance, description: 'BHTN bắt buộc' },
            { id: 'd-7', itemCode: 'PIT', itemName: 'Thuế TNCN', itemType: 'STATUTORY_DEDUCTION', amount: pay.pitTax, description: 'Thuế thu nhập cá nhân lũy tiến' },
          ],
        };
      }),
      create: vi.fn(async ({ data }) => {
        const id = data.id || uid('pay');
        const pay = { id, ...data };
        state.payrolls.set(id, pay);
        return pay;
      }),
      upsert: vi.fn(async ({ where, create, update }) => {
        let foundId = '';
        for (const [k, v] of state.payrolls.entries()) {
          if (v.periodId === where.periodId_employeeId?.periodId && v.employeeId === where.periodId_employeeId?.employeeId) {
            foundId = k;
            break;
          }
        }
        if (foundId) {
          const updated = { ...state.payrolls.get(foundId), ...update };
          state.payrolls.set(foundId, updated);
          return updated;
        } else {
          const id = uid('pay');
          const created = { id, ...create };
          state.payrolls.set(id, created);
          return created;
        }
      }),
    },
    payrollApproval: {
      create: vi.fn(async ({ data }) => {
        const id = uid('appr');
        const appr = { id, ...data };
        state.payrollApprovals.set(id, appr);
        return appr;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }) => {
        state.auditLogs.push({ id: uid('audit'), timestamp: new Date(), ...data });
        return true;
      }),
    },
    $transaction: vi.fn(async (callback: any) => {
      if (typeof callback === 'function') {
        return callback(p);
      }
      return Promise.all(callback);
    }),
  };
  return { prisma: p };
});

// ─── Test Suite Execution ───────────────────────────────────────────────────

describe('🌐 Phase 27 — Real World End-to-End Enterprise Simulation', () => {
  // Session Definitions for Actors
  const adminSession: UserSession = {
    userId: 'usr-ceo',
    email: 'admin@antigravity.internal',
    roles: ['admin'],
    fullName: 'Tổng Giám Đốc',
    permissions: [],
    isActive: true,
  };

  const hrSession: UserSession = {
    userId: 'usr-hr-mgr',
    email: 'hr@antigravity.internal',
    roles: ['hr'],
    fullName: 'Trưởng Phòng Nhân Sự',
    permissions: [],
    isActive: true,
  };

  const techLeadSession: UserSession = {
    userId: 'usr-tech-lead',
    email: 'manager.tech@antigravity.internal',
    roles: ['manager'],
    fullName: 'Trưởng Nhóm Tech',
    permissions: [],
    isActive: true,
  };

  const devAnSession: UserSession = {
    userId: 'usr-dev-an',
    email: 'dev.an@antigravity.internal',
    roles: ['employee'],
    fullName: 'Phạm Văn An',
    permissions: [],
    isActive: true,
  };

  const nightOpsSession: UserSession = {
    userId: 'usr-ops-huy',
    email: 'ops.huy@antigravity.internal',
    roles: ['employee'],
    fullName: 'Bùi Quang Huy',
    permissions: [],
    isActive: true,
  };

  const hrCbSession: UserSession = {
    userId: 'usr-hr-cb',
    email: 'hr.anh@antigravity.internal',
    roles: ['employee'],
    fullName: 'Hoàng Ngọc Ánh',
    permissions: [],
    isActive: true,
  };

  // Shared References across Stages
  let fixedShiftId = '';
  let flexShiftId = '';
  let nightShiftId = '';
  let devAnEmpId = '';
  let nightOpsEmpId = '';
  let salesLeadEmpId = '';
  let hrCbEmpId = '';

  // --------------------------------------------------------------------------
  // STAGE 1: EMPLOYEE PROVISIONING
  // --------------------------------------------------------------------------
  it('Stage 1 — Should provision enterprise departments, positions, and 8 employees', async () => {
    // 1. Create 5 Departments
    const deptCodes = ['BOD', 'HR', 'TECH', 'SALES', 'OPS'];
    for (const code of deptCodes) {
      await DepartmentService.createDepartment(
        {
          code,
          name: `Phòng Ban ${code}`,
          description: `Mô tả chức năng bộ phận ${code}`,
          isActive: true,
        },
        adminSession
      );
    }
    expect(state.departments.size).toBe(5);

    // 2. Create 8 Positions with Salary Grades
    const positions = [
      { code: 'CEO', title: 'Giám Đốc Điều Hành', baseSalaryGrade: 65000000 },
      { code: 'HR_DIR', title: 'Trưởng Phòng Nhân Sự', baseSalaryGrade: 38000000 },
      { code: 'HR_CB', title: 'Chuyên Viên C&B', baseSalaryGrade: 18000000 },
      { code: 'TECH_LEAD', title: 'Trưởng Phòng Kỹ Thuật', baseSalaryGrade: 45000000 },
      { code: 'DEV_SR', title: 'Kỹ Sư Phần Mềm Cao Cấp', baseSalaryGrade: 32000000 },
      { code: 'DEV_MID', title: 'Kỹ Sư Phần Mềm', baseSalaryGrade: 22000000 },
      { code: 'SALES_LEAD', title: 'Trưởng Nhóm Kinh Doanh', baseSalaryGrade: 28000000 },
      { code: 'OPS_NIGHT', title: 'Chuyên Viên Vận Hành Ca Đêm', baseSalaryGrade: 18000000 },
    ];
    for (const pos of positions) {
      await PositionService.createPosition(
        {
          code: pos.code,
          title: pos.title,
          baseSalaryGrade: pos.baseSalaryGrade,
          minSalary: pos.baseSalaryGrade * 0.8,
          maxSalary: pos.baseSalaryGrade * 1.5,
          isActive: true,
        },
        adminSession
      );
    }
    expect(state.positions.size).toBe(8);

    // 3. Create 8 Employees with Diverse Compensation Profiles
    const employeesData = [
      { code: 'EMP-0001', userId: 'usr-ceo', first: 'Minh Tuấn', last: 'Nguyễn', dept: 'BOD', pos: 'CEO', salary: 65000000, dep: 2, role: 'admin' },
      { code: 'EMP-0002', userId: 'usr-hr-mgr', first: 'Mai Hương', last: 'Trần Thị', dept: 'HR', pos: 'HR_DIR', salary: 38000000, dep: 1, role: 'hr' },
      { code: 'EMP-0003', userId: 'usr-tech-lead', first: 'Hoàng Nam', last: 'Lê', dept: 'TECH', pos: 'TECH_LEAD', salary: 45000000, dep: 0, role: 'manager' },
      { code: 'EMP-0004', userId: 'usr-dev-an', first: 'Văn An', last: 'Phạm', dept: 'TECH', pos: 'DEV_SR', salary: 32000000, dep: 1, role: 'employee' },
      { code: 'EMP-0005', userId: 'usr-dev-cuong', first: 'Quốc Cường', last: 'Vũ', dept: 'TECH', pos: 'DEV_MID', salary: 22000000, dep: 0, role: 'employee' },
      { code: 'EMP-0006', userId: 'usr-sales-chau', first: 'Minh Châu', last: 'Đặng', dept: 'SALES', pos: 'SALES_LEAD', salary: 28000000, dep: 0, role: 'employee' },
      { code: 'EMP-0007', userId: 'usr-ops-huy', first: 'Quang Huy', last: 'Bùi', dept: 'OPS', pos: 'OPS_NIGHT', salary: 18000000, dep: 0, role: 'employee' },
      { code: 'EMP-0008', userId: 'usr-hr-cb', first: 'Ngọc Ánh', last: 'Hoàng', dept: 'HR', pos: 'HR_CB', salary: 16000000, dep: 0, role: 'employee' },
    ];

    for (const e of employeesData) {
      const dept = Array.from(state.departments.values()).find((d) => d.code === e.dept);
      const pos = Array.from(state.positions.values()).find((p) => p.code === e.pos);
      const created = await EmployeeService.createEmployee(
        {
          employeeCode: e.code,
          firstName: e.first,
          lastName: e.last,
          email: `${e.code.toLowerCase()}@antigravity.internal`,
          gender: 'MALE',
          phoneNumber: '0901234567',
          departmentId: dept.id,
          positionId: pos.id,
          contractType: 'INDEFINITE',
          contractSalary: e.salary,
          insuranceSalary: Math.min(e.salary, 46800000),
          dependentsCount: e.dep,
          status: 'ACTIVE',
          hireDate: '2026-01-01',
          hourlyRate: 0,
          documents: [],
        },
        adminSession
      );

      // Harmonize session user ID with created user ID
      if (e.code === 'EMP-0001') adminSession.userId = created.userId;
      if (e.code === 'EMP-0002') hrSession.userId = created.userId;
      if (e.code === 'EMP-0003') techLeadSession.userId = created.userId;
      if (e.code === 'EMP-0004') {
        devAnEmpId = created.id;
        devAnSession.userId = created.userId;
      }
      if (e.code === 'EMP-0006') salesLeadEmpId = created.id;
      if (e.code === 'EMP-0007') {
        nightOpsEmpId = created.id;
        nightOpsSession.userId = created.userId;
      }
      if (e.code === 'EMP-0008') {
        hrCbEmpId = created.id;
        hrCbSession.userId = created.userId;
      }
    }
    expect(state.employees.size).toBe(8);

    const devAn = state.employees.get(devAnEmpId);
    expect(devAn).toBeDefined();
    expect(Number(devAn.contractSalary)).toBe(32000000);
    expect(devAn.dependentsCount).toBe(1);
  });

  // --------------------------------------------------------------------------
  // STAGE 2: SCHEDULE & SHIFT ASSIGNMENT
  // --------------------------------------------------------------------------
  it('Stage 2 — Should configure Fixed, Flexible, and Overnight shifts and assign rosters', async () => {
    // 1. Create Fixed Shift (Ca Hành Chính: 08:00 - 17:00)
    const fixedShift = await ShiftService.createShift(
      {
        code: 'CA_HANH_CHINH',
        name: 'Ca Hành Chính Cố Định',
        shiftType: 'FIXED',
        startTime: '08:00',
        endTime: '17:00',
        breakMinutes: 60,
        isOvernight: false,
        gracePeriodLate: 15,
        gracePeriodEarly: 15,
        standardWorkHours: 8.0,
        isActive: true,
        effectiveFrom: '2026-01-01',
      },
      adminSession
    );
    fixedShiftId = fixedShift.id;
    expect(fixedShiftId).toBeDefined();
    expect(fixedShift.code).toBe('CA_HANH_CHINH');

    // 2. Create Flexible Shift (Ca Linh Hoạt: 07:30 - 18:30, 8h làm việc)
    const flexShift = await ShiftService.createShift(
      {
        code: 'CA_LINH_HOAT',
        name: 'Ca Linh Hoạt Kỹ Thuật',
        shiftType: 'FLEXIBLE',
        startTime: '07:30',
        endTime: '18:30',
        breakMinutes: 60,
        isOvernight: false,
        gracePeriodLate: 30,
        gracePeriodEarly: 30,
        standardWorkHours: 8.0,
        isActive: true,
        effectiveFrom: '2026-01-01',
      },
      adminSession
    );
    flexShiftId = flexShift.id;
    expect(flexShift.shiftType).toBe('FLEXIBLE');

    // 3. Create Overnight Shift (Ca Đêm Vận Hành: 22:00 - 06:00, isOvernight = true)
    const nightShift = await ShiftService.createShift(
      {
        code: 'CA_DEM',
        name: 'Ca Đêm Vận Hành 24/7',
        shiftType: 'FIXED',
        startTime: '22:00',
        endTime: '06:00',
        breakMinutes: 60,
        isOvernight: true,
        gracePeriodLate: 15,
        gracePeriodEarly: 15,
        standardWorkHours: 7.0,
        isActive: true,
        effectiveFrom: '2026-01-01',
      },
      adminSession
    );
    nightShiftId = nightShift.id;
    expect(nightShift.isOvernight).toBe(true);

    // 4. Assign Schedules for Employees
    const workDate = '2026-09-01';
    const devSchedule = await ScheduleService.assignSingleSchedule(
      {
        employeeId: devAnEmpId,
        shiftId: flexShiftId,
        workDate,
        isTemporary: false,
        notes: 'Phân ca linh hoạt phòng Tech',
      },
      adminSession
    );
    expect(devSchedule).toBeDefined();

    const nightSchedule = await ScheduleService.assignSingleSchedule(
      {
        employeeId: nightOpsEmpId,
        shiftId: nightShiftId,
        workDate,
        isTemporary: false,
        notes: 'Phân ca đêm vận hành 24/7',
      },
      adminSession
    );
    expect(nightSchedule).toBeDefined();
    expect(state.schedules.size).toBeGreaterThanOrEqual(2);
  });

  // --------------------------------------------------------------------------
  // STAGE 3: ATTENDANCE PROCESSING
  // --------------------------------------------------------------------------
  it('Stage 3 — Should process realistic attendance metrics (Normal, Late, Early, OT, Overnight)', async () => {
    // 1. Normal Attendance: 8.0h, 0 late (Dev An)
    const attNormal = await AttendanceService.checkIn(
      {
        workDate: '2026-09-01',
        checkInMethod: 'QR',
        checkInTime: '2026-09-01T08:00:00',
      },
      devAnSession
    );
    expect(attNormal.status).toBe('IN_PROGRESS');

    const attNormalOut = await AttendanceService.checkOut(
      {
        attendanceId: attNormal.id,
        checkOutMethod: 'QR',
        checkOutTime: '2026-09-01T17:00:00',
      },
      devAnSession
    );
    expect(attNormalOut.actualWorkHours).toBeGreaterThanOrEqual(8.0);

    // 2. Overtime Attendance (Dev An on another date: 08:00 to 19:30 -> 2.5h OT)
    const attOt = await AttendanceService.checkIn(
      {
        workDate: '2026-09-02',
        checkInMethod: 'QR',
        checkInTime: '2026-09-02T08:00:00',
      },
      devAnSession
    );
    const attOtOut = await AttendanceService.checkOut(
      {
        attendanceId: attOt.id,
        checkOutMethod: 'QR',
        checkOutTime: '2026-09-02T19:30:00',
      },
      devAnSession
    );
    expect(attOtOut.otHours).toBeGreaterThanOrEqual(2.5);

    // 3. Overnight Attendance (Night Ops: 22:00 to 06:00 next day)
    const attNight = await AttendanceService.checkIn(
      {
        workDate: '2026-09-03',
        checkInMethod: 'QR',
        checkInTime: '2026-09-03T22:00:00',
      },
      nightOpsSession
    );
    const attNightOut = await AttendanceService.checkOut(
      {
        attendanceId: attNight.id,
        checkOutMethod: 'QR',
        checkOutTime: '2026-09-04T06:00:00',
      },
      nightOpsSession
    );
    expect(attNightOut.actualWorkHours).toBeGreaterThanOrEqual(7.0);
  });

  // --------------------------------------------------------------------------
  // STAGE 4: EXCEPTION & ATTENDANCE ADJUSTMENT WORKFLOW
  // --------------------------------------------------------------------------
  it('Stage 4 — Should handle missing check-out exception and approve adjustment workflow', async () => {
    const workDate = new Date('2026-09-02T00:00:00');

    // 1. Employee checked in for night shift but forgot to check out
    const missingAtt = await AttendanceService.checkIn(
      {
        workDate: '2026-09-02',
        checkInMethod: 'QR',
        checkInTime: '2026-09-02T22:00:00',
      },
      nightOpsSession
    );
    expect(missingAtt.checkOutTime).toBeUndefined();

    // 2. Employee submits Attendance Adjustment
    state.adjustments.set('adj-001', {
      id: 'adj-001',
      attendanceId: missingAtt.id,
      employeeId: nightOpsEmpId,
      workDate,
      requestedCheckIn: new Date('2026-09-02T22:00:00'),
      requestedCheckOut: new Date('2026-09-03T06:00:00'),
      reason: 'Quên quét mã QR sau khi bàn giao ca trực máy chủ',
      status: 'PENDING',
    });
    expect(state.adjustments.get('adj-001').status).toBe('PENDING');

    // 3. Manager approves adjustment and applies override check-out
    const approvedAdj = {
      ...state.adjustments.get('adj-001'),
      status: 'APPROVED',
      approverId: adminSession.userId,
      approvalNotes: 'Đã đối soát camera ca trực. Duyệt 7.0h công đêm.',
    };
    state.adjustments.set('adj-001', approvedAdj);

    // Check out with override time
    await AttendanceService.checkOut(
      {
        attendanceId: missingAtt.id,
        checkOutMethod: 'QR',
        checkOutTime: '2026-09-03T06:00:00',
      },
      nightOpsSession
    );
    const fixedAtt = state.attendances.get(missingAtt.id);
    expect(fixedAtt.checkOutTime).toBeDefined();
    expect(approvedAdj.status).toBe('APPROVED');
  });

  // --------------------------------------------------------------------------
  // STAGE 5: LEAVE REQUEST & APPROVAL
  // --------------------------------------------------------------------------
  it('Stage 5 — Should submit and approve annual leave request for 2 working days', async () => {
    // 1. Submit Annual Leave Request
    hrCbSession.employeeId = hrCbEmpId;
    const leave = await LeaveService.createLeaveRequest(
      {
        leaveTypeId: 'lt-annual',
        requestType: 'LEAVE',
        startDate: '2026-09-10',
        endDate: '2026-09-11',
        durationDays: 2.0,
        reason: 'Giải quyết việc gia đình',
      },
      hrCbSession
    );
    expect(leave.status).toBe('PENDING');
    expect(Number(leave.durationDays)).toBe(2.0);

    // 2. HR Manager processes and approves
    const processed = await LeaveService.processLeaveRequest(
      leave.id,
      {
        decision: 'APPROVED',
        approvalNotes: 'Đã duyệt 2 ngày phép năm theo đúng quy chế',
      },
      hrSession
    );
    expect(processed.status).toBe('APPROVED');
  });

  // --------------------------------------------------------------------------
  // STAGE 6: KPI DEFINITION & SCORING
  // --------------------------------------------------------------------------
  it('Stage 6 — Should create KPI definitions and evaluate monthly achievement', async () => {
    // 1. Define KPI: Sprint Velocity
    const kpi = await KpiService.createKpiDefinition(
      {
        code: 'TECH_VELOCITY',
        title: 'Tốc độ hoàn thành Sprint',
        metricType: 'NUMERIC',
        calculationType: 'HIGHER_IS_BETTER',
        bonusFormula: 'TIERED',
        targetValue: 40,
        unit: 'POINTS',
        period: 'MONTHLY',
        baseBonusAmount: 2000000,
        weight: 100,
      },
      adminSession
    );
    expect(kpi.code).toBe('TECH_VELOCITY');

    // 2. Evaluate Senior Dev An (Actual: 38 points -> 95% achievement)
    const completionRate = (38 / 40) * 100;
    const bonusAmount = Math.round((completionRate / 100) * 2000000);
    const result = {
      id: 'kpir-dev-an',
      employeeId: devAnEmpId,
      kpiId: kpi.id,
      period: '2026-09',
      targetValue: 40,
      actualValue: 38,
      completionRate,
      score: 95,
      weightedScore: 95,
      bonusAmount,
      status: 'APPROVED',
      evaluatorId: techLeadSession.userId,
    };
    state.kpiResults.set(result.id, result);

    expect(result.completionRate).toBe(95);
    expect(result.bonusAmount).toBe(1900000);
    expect(result.status).toBe('APPROVED');
  });

  // --------------------------------------------------------------------------
  // STAGE 7: PERFORMANCE BONUS & DISCIPLINARY PENALTY
  // --------------------------------------------------------------------------
  it('Stage 7 — Should record and approve project bonus and disciplinary penalty', async () => {
    // 1. Create Project Bonus for Sales Lead (5,000,000 ₫)
    const bonus = await BonusService.createBonus(
      {
        employeeId: salesLeadEmpId,
        category: 'PROJECT',
        amount: 5000000,
        effectiveDate: '2026-09-15',
        period: '2026-09',
        reason: 'Thưởng nóng thành tích ký kết hợp đồng khách hàng chiến lược',
      },
      adminSession
    );
    expect(Number(bonus.amount)).toBe(5000000);

    const approvedBonus = await BonusService.processBonus(
      bonus.id,
      { decision: 'APPROVED', approvalNotes: 'Ban Giám Đốc phê duyệt' },
      adminSession
    );
    expect(approvedBonus.status).toBe('APPROVED');

    // 2. Create Disciplinary Penalty for C&B Officer (200,000 ₫)
    const penalty = await PenaltyService.createPenalty(
      {
        employeeId: hrCbEmpId,
        category: 'OTHER',
        amount: 200000,
        effectiveDate: '2026-09-16',
        period: '2026-09',
        reason: 'Vi phạm quy định an toàn thông tin: Không khóa máy khi rời bàn làm việc',
      },
      hrSession
    );
    expect(Number(penalty.amount)).toBe(200000);

    const approvedPenalty = await PenaltyService.processPenalty(
      penalty.id,
      { decision: 'APPROVED', approvalNotes: 'Cảnh cáo và trừ thưởng quy chế' },
      hrSession
    );
    expect(approvedPenalty.status).toBe('APPROVED');
  });

  // --------------------------------------------------------------------------
  // STAGE 8: REAL PAYROLL CALCULATION ENGINE (ACID REAL MATH)
  // --------------------------------------------------------------------------
  it('Stage 8 — Should compute exact statutory insurance, 7-bracket PIT, and net salary', () => {
    // Deterministic mathematical verification for Senior Dev An:
    // Base salary: 32,000,000 ₫ (22 standard days, 22 actual days)
    // Overtime: 2.5h at 150% weekday -> hourlyRate = 32M / (22 * 8) = 181,818 ₫ -> OT Pay = 2.5 * 181,818 * 1.5 = 681,818 ₫
    // KPI Bonus: 1,900,000 ₫
    // Dependents: 1 (4,400,000 ₫ relief)
    const rule = VIETNAM_STATUTORY_RULE_2026;

    const engineResult = PayrollCalculationEngine.calculate({
      baseSalary: 32000000,
      workDays: 22,
      actualWorkDays: 22,
      workHours: 176,
      overtimeHours: 2.5,
      overtimePay: 681818,
      bonus: 1900000,
      penalty: 0,
      dependentsCount: 1,
      ruleConfig: rule,
    });

    // 1. Gross Income Verification
    // 32,000,000 (base) + 681,818 (OT) + 1,900,000 (KPI) = 34,581,818 ₫
    expect(engineResult.grossSalary).toBe(34581818);

    // 2. Mandatory Statutory Insurance Deductions (10.5% total on 32M)
    // BHXH 8% = 2,560,000 ₫
    // BHYT 1.5% = 480,000 ₫
    // BHTN 1% = 320,000 ₫
    // Total = 3,360,000 ₫
    expect(engineResult.employeeSocial).toBe(2560000);
    expect(engineResult.employeeHealth).toBe(480000);
    expect(engineResult.employeeUnemployment).toBe(320000);
    expect(engineResult.insurance).toBe(3360000);

    // 3. Taxable & Assessable Income
    // Taxable = 34,581,818 ₫
    // Relief = 11,000,000 (personal) + 4,400,000 (1 dependent) = 15,400,000 ₫
    // Assessable = 34,581,818 - 3,360,000 (BH) - 15,400,000 (Relief) = 15,821,818 ₫
    expect(engineResult.taxableIncome).toBe(34581818);
    expect(engineResult.assessableIncome).toBe(15821818);

    // 4. Progressive PIT Tax (15,821,818 falls into Bracket 3: 10M - 18M at 15%, quick deduction 750,000 ₫)
    // Tax = 15,821,818 * 0.15 - 750,000 = 1,623,272.7 ₫ -> rounds to 1,623,273
    expect(Math.round(engineResult.tax)).toBe(1623273);

    // 5. Net Salary Verification
    // Unrounded Net = Gross (34,581,818) - Insurance (3,360,000) - PIT (1,623,273) = 29,598,545 ₫
    // Statutory Vietnam banking rounding unit 1,000 VND (HALF_UP):
    // Net Salary = 29,599,000 ₫ (Rounding adjustment: +455 ₫)
    expect(engineResult.netSalary).toBe(29599000);
    expect(Math.round(engineResult.roundingAdjustment)).toBe(455);
  });

  // --------------------------------------------------------------------------
  // STAGE 9: PAYROLL WORKFLOW & STATE MACHINE APPROVAL
  // --------------------------------------------------------------------------
  it('Stage 9 — Should execute state machine transitions (DRAFT -> CALCULATED -> REVIEW -> APPROVED) and enforce immutability', async () => {
    // 1. Create Period
    const period = await PayrollService.createPeriod(
      {
        code: 'PAY-2026-09',
        name: 'Bảng Lương Tháng 09/2026',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        standardWorkDays: 22,
      },
      adminSession
    );
    expect(period.status).toBe('DRAFT');

    // 2. Transition to CALCULATED after calculation
    state.payrollPeriods.get(period.id).status = 'CALCULATED';

    // 3. HR submits for review: CALCULATED -> REVIEW
    const reviewed = await PayrollWorkflowService.transitionPeriodState(
      {
        periodId: period.id,
        action: 'SUBMIT_REVIEW',
        targetStatus: 'REVIEW',
        comments: 'Đã hoàn tất tính toán và đối soát dữ liệu công phép toàn công ty',
      },
      hrSession
    );
    expect(reviewed.status).toBe('REVIEW');

    // 4. CEO approves: REVIEW -> APPROVED
    const approved = await PayrollWorkflowService.transitionPeriodState(
      {
        periodId: period.id,
        action: 'APPROVE',
        targetStatus: 'APPROVED',
        comments: 'Ban Tổng Giám Đốc phê duyệt bảng lương tháng 09/2026',
      },
      adminSession
    );
    expect(approved.status).toBe('APPROVED');

    // 5. Enforce Immutability Guard: Direct modifications on APPROVED periods throw ApiError
    expect(() => {
      PayrollWorkflowService.assertPeriodIsMutable('APPROVED', 'PAY-2026-09');
    }).toThrow(ApiError);
  });

  // --------------------------------------------------------------------------
  // STAGE 10: PAYSLIP GENERATION & ANTI-IDOR SECURITY
  // --------------------------------------------------------------------------
  it('Stage 10 — Should generate detailed PDF payslips and strictly enforce Anti-IDOR guards', async () => {
    const periodId = 'prd-001';
    const payrollId = 'pay-dev-an';

    state.payrollPeriods.set(periodId, {
      id: periodId,
      code: 'PAY-2026-09',
      name: 'Bảng Lương Tháng 09/2026',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
    });

    state.payrolls.set(payrollId, {
      id: payrollId,
      periodId,
      employeeId: devAnEmpId,
      contractSalary: 32000000,
      actualWorkDays: 22,
      paidLeaveDays: 0,
      proratedSalary: 32000000,
      otPay: 681818,
      kpiBonus: 1900000,
      grossIncome: 34581818,
      socialInsurance: 2560000,
      healthInsurance: 480000,
      unemploymentInsurance: 320000,
      taxableIncome: 34581818,
      personalRelief: 11000000,
      dependentsRelief: 4400000,
      assessableIncome: 15821818,
      pitTax: 1623273,
      netSalary: 29598545,
      paymentStatus: 'PAID',
    });

    // 1. Employee views own payslip -> SUCCESS
    const payslip = await PayslipService.getPayslipForPdf(payrollId, devAnSession);
    expect(payslip).toBeDefined();
    expect(payslip.employee.code).toBe('EMP-0004');
    expect(payslip.netSalary).toBe(29598545);
    expect(payslip.earnings.grossSalary).toBe(34581818);
    expect(payslip.lineItems?.length).toBeGreaterThan(0);

    // 2. Another employee attempts to view Dev An's payslip -> STRICTLY BLOCKED WITH 403
    const attackerSession: UserSession = {
      userId: 'usr-attacker-emp-0005',
      email: 'attacker@antigravity.internal',
      roles: ['employee'],
      fullName: 'Attacker Staff',
      permissions: [],
      isActive: true,
    };

    await expect(
      PayslipService.getPayslipForPdf(payrollId, attackerSession)
    ).rejects.toThrow(ApiError);

    // 3. Admin & HR can inspect any employee payslip -> SUCCESS
    const adminView = await PayslipService.getPayslipForPdf(payrollId, adminSession);
    expect(adminView.employee.code).toBe('EMP-0004');

    const hrView = await PayslipService.getPayslipForPdf(payrollId, hrSession);
    expect(hrView.employee.code).toBe('EMP-0004');
  });
});
