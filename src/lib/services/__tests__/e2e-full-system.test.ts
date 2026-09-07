/**
 * PHASE 24 — FULL SYSTEM E2E LIFECYCLE TEST SUITE
 *
 * Exhaustively tests all 20 enterprise lifecycle stages in pair-programming QA mode:
 * 1. Login & Token Authentication
 * 2. Create Employee
 * 3. Create Department
 * 4. Create Position
 * 5. Create Shift
 * 6. Assign Schedule
 * 7. Biometric / Standard Check-in
 * 8. Standard Check-out & Hours Calculation
 * 9. QR Dynamic Rotating Attendance
 * 10. GPS Geofenced Attendance
 * 11. Leave Request Submission
 * 12. Leave Processing & Approval
 * 13. KPI Definition, Assignment & Evaluation
 * 14. Bonus Proposal & Approval
 * 15. Disciplinary Penalty & Deduction
 * 16. Monthly Payroll Calculation Engine
 * 17. Payroll Workflow Review & Adjustments
 * 18. Payroll Period Approval & Lock
 * 19. Payslip Generation & Breakdown
 * 20. Employee Self-Service Payslip View & Anti-IDOR Security
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { signSessionToken, verifySessionToken } from '@/lib/auth/session';
import { UserSession } from '@/types';
import { ApiError } from '@/lib/errors';
import { AttendanceService } from '../attendance.service';
import { QrAttendanceService } from '../qr-attendance.service';
import { GpsAttendanceService } from '../gps-attendance.service';
import { ShiftService } from '../shift.service';
import { ScheduleService } from '../schedule.service';
import { DepartmentService } from '../department.service';
import { PositionService } from '../position.service';
import { EmployeeService } from '../employee.service';
import { LeaveService } from '../leave.service';
import { KpiService } from '../kpi.service';
import { BonusService } from '../bonus.service';
import { PenaltyService } from '../penalty.service';
import { PayrollService } from '../payroll.service';
import { PayrollWorkflowService } from '../payroll-workflow.service';
import { PayslipService } from '../payslip.service';
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';
import { PayrollRuleEngine } from '@/lib/payroll/payroll-rule-engine';
import { prisma } from '@/lib/db/prisma';

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
  worksites: new Map<string, any>(),
  qrTokens: new Map<string, any>(),
  leaveRequests: new Map<string, any>(),
  leaveBalances: new Map<string, any>(),
  kpiDefinitions: new Map<string, any>(),
  kpiAssignments: new Map<string, any>(),
  bonusPenalties: new Map<string, any>(),
  payrollPeriods: new Map<string, any>(),
  payrollRules: new Map<string, any>(),
  payrolls: new Map<string, any>(),
  payrollDetails: new Map<string, any>(),
  payrollApprovals: new Map<string, any>(),
  auditLogs: [] as any[],
};

// Mock Prisma
vi.mock('@/lib/db/prisma', () => {
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
        const id = data.id || `usr-${Date.now()}-${Math.random()}`;
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
        if (!where) return Array.from(state.departments.values())[0] || null;
        if (where.code) {
          for (const d of state.departments.values()) {
            if (d.code === where.code) return d;
          }
        }
        if (where.id) return state.departments.get(where.id) || null;
        return null;
      }),
      findMany: vi.fn(async () => Array.from(state.departments.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `dept-${Date.now()}`;
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
        if (!where) return Array.from(state.positions.values())[0] || null;
        if (where.code) {
          for (const pos of state.positions.values()) {
            if (pos.code === where.code) return pos;
          }
        }
        if (where.id) return state.positions.get(where.id) || null;
        return null;
      }),
      findMany: vi.fn(async () => Array.from(state.positions.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `pos-${Date.now()}`;
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
        if (!emp && where.identityCard) {
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
          department: dept ? { id: dept.id, name: dept.name, code: dept.code } : null,
          position: pos ? { id: pos.id, title: pos.title, code: pos.code } : null,
          worksite: ws || null,
          user: u || { id: emp.userId, email: emp.email, isActive: true },
          managedDepartments: [],
        };
      }),
      findFirst: vi.fn(async ({ where }: any = {}) => {
        if (!where) return Array.from(state.employees.values())[0] || null;
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
        if (!emp && where.identityCard) {
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
          department: dept ? { id: dept.id, name: dept.name, code: dept.code } : null,
          position: pos ? { id: pos.id, title: pos.title, code: pos.code } : null,
          worksite: ws || null,
          user: u || { id: emp.userId, email: emp.email, isActive: true },
          managedDepartments: [],
        };
      }),
      findMany: vi.fn(async () => Array.from(state.employees.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `emp-${Date.now()}`;
        const u = data.userId ? state.users.get(data.userId) : null;
        const emp = {
          id,
          ...data,
          user: u || { id: data.userId || 'usr-emp-e2e', email: 'nguyenvana.e2e@antigravity.corp', isActive: true },
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
        if (!where) return Array.from(state.shifts.values())[0] || null;
        if (where.code) {
          for (const s of state.shifts.values()) {
            if (s.code === where.code) return s;
          }
        }
        if (where.id) return state.shifts.get(where.id) || null;
        return null;
      }),
      findMany: vi.fn(async () => Array.from(state.shifts.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `shift-${Date.now()}`;
        const s = { id, ...data, _count: { schedules: 0, recurringSchedules: 0 } };
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
        const id = data.id || `sch-${Date.now()}`;
        const key = `${data.employeeId}_${new Date(data.workDate).toISOString().split('T')[0]}`;
        const shift = state.shifts.get(data.shiftId);
        const emp = state.employees.get(data.employeeId);
        const s = { id, ...data, shift, employee: emp };
        state.schedules.set(key, s);
        return s;
      }),
      update: vi.fn(async ({ where, data }) => {
        let s: any = null;
        for (const [k, v] of state.schedules.entries()) {
          if (v.id === where.id) {
            const shift = state.shifts.get(data.shiftId || v.shiftId);
            const emp = state.employees.get(v.employeeId);
            s = { ...v, ...data, shift, employee: emp };
            state.schedules.set(k, s);
            break;
          }
        }
        return s;
      }),
      upsert: vi.fn(async ({ where, create, update }) => {
        const key = `${where.employeeId_workDate.employeeId}_${new Date(where.employeeId_workDate.workDate).toISOString().split('T')[0]}`;
        const existing = state.schedules.get(key);
        const shift = state.shifts.get(update?.shiftId || create?.shiftId);
        const emp = state.employees.get(create?.employeeId || existing?.employeeId);
        const val = existing ? { ...existing, ...update, shift, employee: emp } : { id: `sch-${Date.now()}`, ...create, shift, employee: emp };
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
        const id = data.id || `att-${Date.now()}`;
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
    },
    worksite: {
      findUnique: vi.fn(async ({ where }) => state.worksites.get(where.id) || null),
      findMany: vi.fn(async () => Array.from(state.worksites.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `ws-${Date.now()}`;
        const ws = { id, ...data };
        state.worksites.set(id, ws);
        return ws;
      }),
    },
    qrAttendanceToken: {
      findUnique: vi.fn(async ({ where }) => {
        if (where.code) {
          for (const t of state.qrTokens.values()) {
            if (t.code === where.code) return t;
          }
        }
        if (where.id) return state.qrTokens.get(where.id) || null;
        return null;
      }),
      findFirst: vi.fn(async ({ where }) => {
        if (where?.code) {
          for (const t of state.qrTokens.values()) {
            if (t.code === where.code) return t;
          }
        }
        return null;
      }),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `qrt-${Date.now()}`;
        const t = { id, isUsed: false, usedCount: 0, maxUses: 1, ...data };
        state.qrTokens.set(id, t);
        return t;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.qrTokens.get(where.id);
        const updated = { ...existing, ...data };
        state.qrTokens.set(where.id, updated);
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
            employeeCode: emp?.employeeCode || 'EMP-E2E-001',
            firstName: emp?.firstName || 'Văn',
            lastName: emp?.lastName || 'Nguyễn',
            departmentId: emp?.departmentId,
            department: { id: emp?.departmentId, name: 'Phòng Kỹ thuật' },
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
        const id = data.id || `leave-${Date.now()}`;
        const l = { id, status: 'PENDING', ...data };
        state.leaveRequests.set(id, l);
        const emp = state.employees.get(data.employeeId);
        return {
          ...l,
          employee: {
            id: emp?.id || data.employeeId,
            employeeCode: emp?.employeeCode || 'EMP-E2E-001',
            firstName: emp?.firstName || 'Văn',
            lastName: emp?.lastName || 'Nguyễn',
            departmentId: emp?.departmentId,
            department: { id: emp?.departmentId, name: 'Phòng Kỹ thuật' },
          },
          leaveType: {
            id: 'lt-annual',
            code: 'ANNUAL',
            name: 'Nghỉ phép năm',
            isPaid: true,
          },
        };
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.leaveRequests.get(where.id);
        const updated = { ...existing, ...data };
        state.leaveRequests.set(where.id, updated);
        const emp = state.employees.get(updated.employeeId);
        return {
          ...updated,
          employee: {
            id: emp?.id || updated.employeeId,
            employeeCode: emp?.employeeCode || 'EMP-E2E-001',
            firstName: emp?.firstName || 'Văn',
            lastName: emp?.lastName || 'Nguyễn',
            departmentId: emp?.departmentId,
            department: { id: emp?.departmentId, name: 'Phòng Kỹ thuật' },
          },
          leaveType: {
            id: 'lt-annual',
            code: 'ANNUAL',
            name: 'Nghỉ phép năm',
            isPaid: true,
          },
        };
      }),
      count: vi.fn(async () => state.leaveRequests.size),
    },
    leaveBalance: {
      findUnique: vi.fn(async ({ where }) => {
        const key = `${where.employeeId_leaveTypeId_year.employeeId}_${where.employeeId_leaveTypeId_year.leaveTypeId}_${where.employeeId_leaveTypeId_year.year}`;
        return state.leaveBalances.get(key) || {
          id: 'lb-default',
          employeeId: where.employeeId_leaveTypeId_year.employeeId,
          leaveTypeId: where.employeeId_leaveTypeId_year.leaveTypeId,
          year: where.employeeId_leaveTypeId_year.year,
          entitledDays: 12,
          carriedOverDays: 0,
          usedDays: 0,
          pendingDays: 0,
        };
      }),
      create: vi.fn(async ({ data }) => {
        const id = `lb-${Date.now()}`;
        const b = { id, ...data };
        const key = `${data.employeeId}_${data.leaveTypeId}_${data.year}`;
        state.leaveBalances.set(key, b);
        return b;
      }),
      update: vi.fn(async ({ where, data }) => {
        const key = `${where.employeeId_leaveTypeId_year.employeeId}_${where.employeeId_leaveTypeId_year.leaveTypeId}_${where.employeeId_leaveTypeId_year.year}`;
        const existing = state.leaveBalances.get(key) || { usedDays: 0, pendingDays: 0 };
        const updated = { ...existing, ...data };
        state.leaveBalances.set(key, updated);
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
      findFirst: vi.fn(async () => ({
        id: 'lt-annual',
        code: 'ANNUAL',
        name: 'Nghỉ phép năm',
        isPaid: true,
        daysPerYear: 12,
        isActive: true,
      })),
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
        if (!where) return Array.from(state.kpiDefinitions.values())[0] || null;
        if (where.code) {
          for (const k of state.kpiDefinitions.values()) {
            if (k.code === where.code) return k;
          }
        }
        if (where.id) return state.kpiDefinitions.get(where.id) || null;
        return null;
      }),
      findMany: vi.fn(async () => Array.from(state.kpiDefinitions.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `kpi-${Date.now()}`;
        const k = { id, ...data };
        state.kpiDefinitions.set(id, k);
        return k;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.kpiDefinitions.get(where.id);
        const updated = { ...existing, ...data };
        state.kpiDefinitions.set(where.id, updated);
        return updated;
      }),
      delete: vi.fn(async ({ where }) => {
        const k = state.kpiDefinitions.get(where.id);
        state.kpiDefinitions.delete(where.id);
        return k;
      }),
      count: vi.fn(async () => state.kpiDefinitions.size),
    },
    employeeKpiResult: {
      findUnique: vi.fn(async ({ where }) => {
        if (where.id) return state.kpiAssignments.get(where.id) || null;
        if (where.employeeId_kpiId_period) {
          for (const a of state.kpiAssignments.values()) {
            if (
              a.employeeId === where.employeeId_kpiId_period.employeeId &&
              a.kpiId === where.employeeId_kpiId_period.kpiId &&
              a.period === where.employeeId_kpiId_period.period
            ) {
              return a;
            }
          }
        }
        return null;
      }),
      findMany: vi.fn(async () => Array.from(state.kpiAssignments.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `kpia-${Date.now()}`;
        const kpi = state.kpiDefinitions.get(data.kpiId);
        const emp = state.employees.get(data.employeeId);
        const a = { id, status: 'ASSIGNED', ...data, kpi, employee: emp };
        state.kpiAssignments.set(id, a);
        return a;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.kpiAssignments.get(where.id);
        const updated = { ...existing, ...data };
        state.kpiAssignments.set(where.id, updated);
        return updated;
      }),
      count: vi.fn(async () => state.kpiAssignments.size),
    },
    employeeBonusPenalty: {
      findUnique: vi.fn(async ({ where }) => state.bonusPenalties.get(where.id) || null),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => Array.from(state.bonusPenalties.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `bp-${Date.now()}`;
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
      delete: vi.fn(async ({ where }) => {
        const bp = state.bonusPenalties.get(where.id);
        state.bonusPenalties.delete(where.id);
        return bp;
      }),
      count: vi.fn(async () => state.bonusPenalties.size),
    },
    payrollPeriod: {
      findUnique: vi.fn(async ({ where }) => {
        const p = state.payrollPeriods.get(where.id);
        if (!p) return null;
        return {
          ...p,
          payrollRule: {
            id: 'rule-vietnam-2026',
            code: VIETNAM_STATUTORY_RULE_2026.ruleCode,
            name: VIETNAM_STATUTORY_RULE_2026.ruleName,
            version: '2026.1',
            salaryBasisConfig: VIETNAM_STATUTORY_RULE_2026.salaryBasis,
            overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime,
            insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance,
            taxConfig: VIETNAM_STATUTORY_RULE_2026.tax,
            deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction,
            roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding,
          },
          _count: { payrolls: state.payrolls.size || 1 },
          approvals: Array.from(state.payrollApprovals.values()).filter((a: any) => a.periodId === p.id),
        };
      }),
      findFirst: vi.fn(async ({ where }: any = {}) => {
        if (!where) return Array.from(state.payrollPeriods.values())[0] || null;
        if (where.code) {
          for (const p of state.payrollPeriods.values()) {
            if (p.code === where.code) return p;
          }
        }
        if (where.id) return state.payrollPeriods.get(where.id) || null;
        return null;
      }),
      findMany: vi.fn(async () => Array.from(state.payrollPeriods.values())),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `prd-${Date.now()}`;
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
      count: vi.fn(async () => state.payrollPeriods.size),
    },
    payrollRuleConfig: {
      findUnique: vi.fn(async () => ({
        id: 'rule-vietnam-2026',
        code: 'VN_STATUTORY_2026',
        name: 'Quy chế lương chuẩn Việt Nam 2026',
        isDefault: true,
        salaryBasisConfig: { standardWorkDays: 22, method: 'FIXED' },
        overtimeConfig: { weekdayRate: 1.5, weekendRate: 2.0, holidayRate: 3.0 },
        insuranceConfig: {
          employeeSocialRate: 0.08,
          employeeHealthRate: 0.015,
          employeeUnemploymentRate: 0.01,
        },
        taxConfig: { model: 'PROGRESSIVE', personalRelief: 11000000, dependentRelief: 4400000 },
      })),
      findFirst: vi.fn(async () => ({
        id: 'rule-vietnam-2026',
        code: 'VN_STATUTORY_2026',
        name: 'Quy chế lương chuẩn Việt Nam 2026',
        isDefault: true,
        salaryBasisConfig: { standardWorkDays: 22, method: 'FIXED' },
        overtimeConfig: { weekdayRate: 1.5, weekendRate: 2.0, holidayRate: 3.0 },
        insuranceConfig: {
          employeeSocialRate: 0.08,
          employeeHealthRate: 0.015,
          employeeUnemploymentRate: 0.01,
        },
        taxConfig: { model: 'PROGRESSIVE', personalRelief: 11000000, dependentRelief: 4400000 },
      })),
    },
    payroll: {
      findUnique: vi.fn(async ({ where }) => {
        const p = state.payrolls.get(where.id);
        if (!p) return null;
        const emp = state.employees.get(p.employeeId);
        const dept = emp?.departmentId ? state.departments.get(emp.departmentId) : null;
        const pos = emp?.positionId ? state.positions.get(emp.positionId) : null;
        const period = state.payrollPeriods.get(p.periodId) || p.period;
        return {
          ...p,
          period,
          employee: {
            ...emp,
            department: dept ? { id: dept.id, name: dept.name } : null,
            position: pos ? { id: pos.id, title: pos.title } : null,
          },
          details: p.details || [],
        };
      }),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async ({ where }: any = {}) => {
        let list = Array.from(state.payrolls.values());
        if (where?.employeeId) {
          list = list.filter((p) => p.employeeId === where.employeeId);
        }
        return list.map((p) => {
          const emp = state.employees.get(p.employeeId);
          const dept = emp?.departmentId ? state.departments.get(emp.departmentId) : null;
          const pos = emp?.positionId ? state.positions.get(emp.positionId) : null;
          const period = state.payrollPeriods.get(p.periodId) || p.period;
          return {
            ...p,
            period,
            employee: {
              ...emp,
              department: dept ? { id: dept.id, name: dept.name } : null,
              position: pos ? { id: pos.id, title: pos.title } : null,
            },
            details: p.details || [],
          };
        });
      }),
      create: vi.fn(async ({ data }) => {
        const id = data.id || `pr-${Date.now()}`;
        const p = { id, ...data };
        state.payrolls.set(id, p);
        return p;
      }),
      update: vi.fn(async ({ where, data }) => {
        const existing = state.payrolls.get(where.id);
        const updated = { ...existing, ...data };
        state.payrolls.set(where.id, updated);
        return updated;
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => state.payrolls.size),
    },
    payrollDetail: {
      createMany: vi.fn(async () => ({ count: 5 })),
      deleteMany: vi.fn(async () => ({ count: 5 })),
    },
    payrollApproval: {
      create: vi.fn(async ({ data }) => {
        const id = `appr-${Date.now()}`;
        const a = { id, actionAt: new Date(), ...data };
        state.payrollApprovals.set(id, a);
        return a;
      }),
      findMany: vi.fn(async () => Array.from(state.payrollApprovals.values())),
    },
    payrollAdjustment: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }) => ({ id: `adj-${Date.now()}`, ...data })),
    },
    auditLog: {
      create: vi.fn(async ({ data }) => {
        state.auditLogs.push(data);
        return { id: `log-${Date.now()}`, ...data };
      }),
      findMany: vi.fn(async () => state.auditLogs),
    },
    $transaction: vi.fn(async (cb) => typeof cb === 'function' ? cb(p) : Promise.all(cb)),
  };

  // Setup Aliases
  p.attendanceRecord = p.attendance;
  p.qrToken = p.qrAttendanceToken;
  p.kpiDefinition = p.kpi;
  p.kpiAssignment = p.employeeKpiResult;
  p.bonusPenalty = p.employeeBonusPenalty;

  return { prisma: p };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('PHASE 24 — FULL SYSTEM E2E TESTING (20 STAGES)', () => {
  // Shared Test Actors
  const adminSession: UserSession = {
    userId: 'usr-admin-e2e',
    employeeId: 'emp-admin-e2e',
    email: 'admin@antigravity.corp',
    fullName: 'System Admin',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
  };

  const hrSession: UserSession = {
    userId: 'usr-hr-e2e',
    employeeId: 'emp-hr-e2e',
    email: 'hr@antigravity.corp',
    fullName: 'HR Manager',
    roles: ['hr'],
    permissions: ['employee:*', 'attendance:*', 'leave:*', 'payroll:*'],
    isActive: true,
  };

  let employeeSession: UserSession;
  let testEmployeeId: string;
  let testDepartmentId: string;
  let testPositionId: string;
  let testShiftId: string;
  let testPayrollPeriodId: string;
  let testPayrollId: string;

  beforeEach(() => {
    // Seed essential roles
    state.roles.set('admin', { id: 'role-admin', code: 'admin', name: 'Quản trị viên' });
    state.roles.set('hr', { id: 'role-hr', code: 'hr', name: 'Nhân sự' });
    state.roles.set('manager', { id: 'role-manager', code: 'manager', name: 'Quản lý' });
    state.roles.set('employee', { id: 'role-employee', code: 'employee', name: 'Nhân viên' });
  });

  // ─── STAGE 1: LOGIN & AUTHENTICATION ─────────────────────────────────────
  describe('Stage 1 — Login & JWT Authentication', () => {
    it('1.1 should hash credentials and verify valid password', async () => {
      const plainPassword = 'SuperSecretPassword@2026';
      const hash = await hashPassword(plainPassword);

      expect(hash).not.toBe(plainPassword);
      expect(await verifyPassword(plainPassword, hash)).toBe(true);
      expect(await verifyPassword('WrongPassword', hash)).toBe(false);
    });

    it('1.2 should issue and verify cryptographically signed HS256 JWT tokens', async () => {
      const token = await signSessionToken(adminSession);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const payload = await verifySessionToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe(adminSession.userId);
      expect(payload?.roles).toContain('admin');
    });

    it('1.3 should reject corrupted or forged tokens', async () => {
      const forgedToken = 'eyJh.forged.signature';
      const verified = await verifySessionToken(forgedToken);
      expect(verified).toBeNull();
    });
  });

  // ─── STAGE 2: CREATE EMPLOYEE ─────────────────────────────────────────────
  describe('Stage 2 — Create Employee', () => {
    it('2.1 should allow HR/Admin to provision a complete employee with user account', async () => {
      const newEmpInput = {
        employeeCode: 'EMP-E2E-001',
        firstName: 'Văn A',
        lastName: 'Nguyễn',
        email: 'nguyenvana.e2e@antigravity.corp',
        phoneNumber: '0987654321',
        gender: 'MALE' as const,
        departmentId: 'dept-dev',
        positionId: 'pos-dev',
        dob: '1995-05-15',
        identityCard: '001295009999',
        hireDate: '2026-01-01',
        contractType: 'INDEFINITE' as const,
        contractSalary: 22000000,
        insuranceSalary: 22000000,
        hourlyRate: 125000,
        dependentsCount: 0,
        documents: [],
        status: 'ACTIVE' as const,
      };

      const created = await EmployeeService.createEmployee(newEmpInput, hrSession);
      expect(created).toBeDefined();
      expect(created.employeeCode).toBe('EMP-E2E-001');
      testEmployeeId = created.id;

      // Provision employee session
      employeeSession = {
        userId: created.user.id,
        employeeId: created.id,
        email: created.user.email,
        fullName: 'Nguyễn Văn A',
        roles: ['employee'],
        permissions: ['attendance:self', 'leave:self', 'payroll:self'],
        isActive: true,
      };
    });

    it('2.2 should reject duplicate employeeCode or email', async () => {
      await expect(
        EmployeeService.createEmployee(
          {
            employeeCode: 'EMP-E2E-001', // Already created
            firstName: 'Trùng',
            lastName: 'Mã',
            email: 'unique@antigravity.corp',
            phoneNumber: '0912345678',
            gender: 'FEMALE' as const,
            departmentId: 'dept-dev',
            positionId: 'pos-dev',
            dob: '1998-01-01',
            hireDate: '2026-02-01',
            contractType: 'FIXED_TERM' as const,
            contractSalary: 15000000,
            insuranceSalary: 15000000,
            hourlyRate: 85000,
            dependentsCount: 0,
            documents: [],
            status: 'ACTIVE' as const,
          },
          hrSession
        )
      ).rejects.toThrow(ApiError);
    });
  });

  // ─── STAGE 3: CREATE DEPARTMENT ──────────────────────────────────────────
  describe('Stage 3 — Create Department', () => {
    it('3.1 should allow Admin/HR to create a department', async () => {
      const dept = await DepartmentService.createDepartment(
        {
          code: 'ENG_CORE',
          name: 'Kỹ Thuật Cốt Lõi (Core Engineering)',
          description: 'Phòng ban phát triển hệ thống lõi',
          isActive: true,
        },
        adminSession
      );

      expect(dept).toBeDefined();
      expect(dept.code).toBe('ENG_CORE');
      testDepartmentId = dept.id;
    });
  });

  // ─── STAGE 4: CREATE POSITION ────────────────────────────────────────────
  describe('Stage 4 — Create Position', () => {
    it('4.1 should allow Admin/HR to create a position linked to department', async () => {
      const pos = await PositionService.createPosition(
        {
          code: 'SR_ENG',
          title: 'Kỹ Sư Phần Mềm Cao Cấp (Senior SWE)',
          baseSalaryGrade: 22000000,
          minSalary: 18000000,
          maxSalary: 35000000,
          description: 'Thiết kế kiến trúc và triển khai hệ thống',
          isActive: true,
        },
        adminSession
      );

      expect(pos).toBeDefined();
      expect(pos.code).toBe('SR_ENG');
      testPositionId = pos.id;

      // Link test employee to department and position
      state.employees.set(testEmployeeId, {
        ...state.employees.get(testEmployeeId),
        departmentId: testDepartmentId,
        positionId: testPositionId,
      });
    });
  });

  // ─── STAGE 5: CREATE SHIFT ───────────────────────────────────────────────
  describe('Stage 5 — Create Work Shift', () => {
    it('5.1 should create a standard 8h day shift with break deduction', async () => {
      const shift = await ShiftService.createShift(
        {
          code: 'DAY_STANDARD',
          name: 'Ca Chuẩn Hành Chính',
          shiftType: 'FIXED' as const,
          startTime: '08:00',
          endTime: '17:00',
          breakMinutes: 60,
          isOvernight: false,
          gracePeriodLate: 15,
          gracePeriodEarly: 15,
          standardWorkHours: 8.0,
          effectiveFrom: '2026-01-01',
          isActive: true,
        },
        adminSession
      );

      expect(shift).toBeDefined();
      expect(shift.code).toBe('DAY_STANDARD');
      expect(Number(shift.standardWorkHours)).toBe(8);
      testShiftId = shift.id;
    });
  });

  // ─── STAGE 6: ASSIGN SCHEDULE ────────────────────────────────────────────
  describe('Stage 6 — Assign Schedule', () => {
    it('6.1 should assign employee to shift for work date', async () => {
      const schedule = await ScheduleService.assignSingleSchedule(
        {
          employeeId: testEmployeeId,
          shiftId: testShiftId,
          workDate: '2026-09-01',
          isTemporary: false,
        },
        hrSession
      );

      expect(schedule).toBeDefined();
      expect(schedule.employeeId).toBe(testEmployeeId);
      expect(schedule.shiftId).toBe(testShiftId);
    });
  });

  // ─── STAGE 7: CHECK-IN ───────────────────────────────────────────────────
  describe('Stage 7 — Standard Check-in', () => {
    it('7.1 should record check-in at 08:00 and evaluate status as ON_TIME', async () => {
      const checkInTime = new Date(2026, 8, 1, 8, 0, 0);

      const record = await AttendanceService.checkIn(
        {
          employeeId: testEmployeeId,
          checkInTime: checkInTime.toISOString(),
          checkInMethod: 'BIOMETRIC',
        },
        employeeSession
      );

      expect(record).toBeDefined();
      expect(record.status).toBe('IN_PROGRESS');
      expect(record.lateMinutes).toBe(0);
    });
  });

  // ─── STAGE 8: CHECK-OUT ──────────────────────────────────────────────────
  describe('Stage 8 — Standard Check-out & Hours Calculation', () => {
    it('8.1 should record check-out at 18:00 and compute 9h total (1h OT)', async () => {
      const checkOutTime = new Date(2026, 8, 1, 18, 0, 0);
      const record = await AttendanceService.checkOut(
        {
          employeeId: testEmployeeId,
          checkOutTime: checkOutTime.toISOString(),
          workDate: '2026-09-01',
          checkOutMethod: 'BIOMETRIC',
        },
        employeeSession
      );

      expect(record).toBeDefined();
      expect(Number(record.actualWorkHours)).toBe(9);
      expect(Number(record.otHours)).toBe(1);
    });
  });

  // ─── STAGE 9: QR ATTENDANCE ──────────────────────────────────────────────
  describe('Stage 9 — QR Attendance Service', () => {
    it('9.1 should generate rotating cryptographic QR token and scan safely', async () => {
      const tokenPayload = await QrAttendanceService.generateQrToken(
        {
          tokenType: 'CHECK_IN' as const,
          expiresInSeconds: 60,
          location: 'GATE_A1',
        },
        adminSession
      );

      expect(tokenPayload).toBeDefined();
      expect(tokenPayload.code).toBeDefined();
      expect(tokenPayload.qrPayload).toBeDefined();

      const scanResult = await QrAttendanceService.scanQrAttendance(
        {
          qrPayload: tokenPayload.qrPayload,
          lat: 21.028511,
          lng: 105.804817,
        },
        employeeSession
      );

      expect(scanResult).toBeDefined();
      expect(scanResult.action).toBe('CHECK_IN');
      expect(scanResult.employee.employeeCode).toBe('EMP-E2E-001');
    });
  });

  // ─── STAGE 10: GPS ATTENDANCE ────────────────────────────────────────────
  describe('Stage 10 — GPS Attendance & Geofencing', () => {
    it('10.1 should record GPS attendance within worksite perimeter', async () => {
      // Seed worksite
      state.worksites.set('ws-headquarters', {
        id: 'ws-headquarters',
        name: 'Trụ sở chính Antigravity',
        address: 'Hà Nội',
        latitude: 21.028511,
        longitude: 105.804817,
        radiusMeters: 200,
        isActive: true,
      });

      const gpsRecord = await GpsAttendanceService.verifyGpsProximity(
        {
          worksiteId: 'ws-headquarters',
          latitude: 21.028515, // ~0.5m away
          longitude: 105.804820,
          accuracy: 10,
        },
        employeeSession
      );

      expect(gpsRecord.canAttend).toBe(true);
      expect(gpsRecord.isWithinRadius).toBe(true);
      expect(gpsRecord.distanceMeters).toBeLessThanOrEqual(200);
    });

    it('10.2 should reject mock GPS spoofing', async () => {
      await expect(
        GpsAttendanceService.attendWithGps(
          {
            worksiteId: 'ws-headquarters',
            latitude: 21.500000, // ~50 km away
            longitude: 105.804817,
            accuracy: 10,
          },
          employeeSession
        )
      ).rejects.toThrow();
    });
  });

  // ─── STAGE 11: LEAVE REQUEST ─────────────────────────────────────────────
  describe('Stage 11 — Leave Request', () => {
    let leaveRequestId: string;

    it('11.1 should allow employee to submit leave request for upcoming period', async () => {
      const leave = await LeaveService.createLeaveRequest(
        {
          requestType: 'LEAVE',
          leaveTypeId: 'lt-annual',
          startDate: '2026-09-15',
          endDate: '2026-09-16',
          durationDays: 2,
          reason: 'Giải quyết việc gia đình cá nhân',
        },
        employeeSession
      );

      expect(leave).toBeDefined();
      expect(leave.status).toBe('PENDING');
      expect(Number(leave.durationDays)).toBe(2);
      leaveRequestId = leave.id;
    });

    // ─── STAGE 12: LEAVE APPROVAL ──────────────────────────────────────────
    it('12.1 should allow HR/Manager to approve leave request and update balance', async () => {
      const approved = await LeaveService.processLeaveRequest(
        leaveRequestId,
        {
          decision: 'APPROVED',
          approvalNotes: 'Đã duyệt nghỉ phép theo quy chế',
        },
        hrSession
      );

      expect(approved.status).toBe('APPROVED');
    });
  });

  // ─── STAGE 13: KPI DEFINITION, ASSIGNMENT & EVALUATION ───────────────────
  describe('Stage 13 — KPI Management & Calculation', () => {
    let kpiDefId: string;
    let kpiAssignId: string;

    it('13.1 should define, assign and evaluate KPI to achievement tier', async () => {
      // 1. Create KPI Definition
      const kpiDef = await KpiService.createKpiDefinition(
        {
          code: 'KPI_SPRINT_DELIVERY',
          title: 'Tỷ lệ hoàn thành Sprint đúng hạn',
          calculationType: 'HIGHER_IS_BETTER' as const,
          bonusFormula: 'TIERED' as const,
          targetValue: 100,
          unit: 'PERCENT' as const,
          weight: 100,
          baseBonusAmount: 2000000,
          metricType: 'NUMERIC' as const,
          period: 'MONTHLY' as const,
        },
        adminSession
      );
      expect(kpiDef.code).toBe('KPI_SPRINT_DELIVERY');
      kpiDefId = kpiDef.id;

      // 2. Assign KPI
      const assign = await KpiService.assignKpiToEmployee(
        {
          employeeId: testEmployeeId,
          kpiId: kpiDefId,
          period: '2026-09',
          targetValue: 100,
        },
        hrSession
      );
      expect(assign.period).toBe('2026-09');
      kpiAssignId = assign.id;

      // 3. Evaluate KPI
      const evaluated = await KpiService.evaluateKpiAssignment(
        kpiAssignId,
        {
          decision: 'APPROVED',
          actualValue: 110, // 110% achievement
          managerComment: 'Vượt tiến độ sprint 10%',
        },
        hrSession
      );

      expect(evaluated.status).toBe('APPROVED');
      expect(Number(evaluated.completionRate)).toBe(110);
      expect(Number(evaluated.bonusAmount)).toBeGreaterThanOrEqual(2000000);
    });
  });

  // ─── STAGE 14: BONUS PROPOSAL & APPROVAL ─────────────────────────────────
  describe('Stage 14 — Performance Bonus', () => {
    it('14.1 should propose and approve a performance bonus', async () => {
      const bonus = await BonusService.createBonus(
        {
          employeeId: testEmployeeId,
          category: 'PROJECT' as const,
          amount: 5000000,
          period: '2026-09',
          effectiveDate: '2026-09-25',
          reason: 'Hoàn thành xuất sắc dự án trọng điểm',
        },
        hrSession
      );

      expect(bonus.status).toBe('PENDING');

      const approvedBonus = await BonusService.processBonus(
        bonus.id,
        {
          decision: 'APPROVED' as const,
          approvalNotes: 'Ban Giám Đốc phê duyệt',
        },
        adminSession
      );

      expect(approvedBonus.status).toBe('APPROVED');
      expect(Number(approvedBonus.amount)).toBe(5000000);
    });
  });

  // ─── STAGE 15: DISCIPLINARY PENALTY ──────────────────────────────────────
  describe('Stage 15 — Disciplinary Penalty & Deduction', () => {
    it('15.1 should record and approve a disciplinary penalty', async () => {
      const penalty = await PenaltyService.createPenalty(
        {
          employeeId: testEmployeeId,
          category: 'OTHER' as const,
          amount: 500000,
          period: '2026-09',
          effectiveDate: '2026-09-26',
          reason: 'Để lộ thông tin mật ra ngoài mạng nội bộ',
        },
        hrSession
      );

      expect(penalty.status).toBe('PENDING');

      const approvedPenalty = await PenaltyService.processPenalty(
        penalty.id,
        {
          decision: 'APPROVED' as const,
          approvalNotes: 'Hội đồng kỷ luật xác nhận',
        },
        adminSession
      );

      expect(approvedPenalty.status).toBe('APPROVED');
      expect(Number(approvedPenalty.amount)).toBe(500000);
    });
  });

  // ─── STAGE 16: CALCULATE PAYROLL ─────────────────────────────────────────
  describe('Stage 16 — Payroll Calculation Engine', () => {
    it('16.1 should calculate comprehensive payroll with tax, insurance, OT, bonus and penalties', async () => {
      // 1. Create payroll period
      const period = await prisma.payrollPeriod.create({
        data: {
          code: 'PRD-2026-09',
          name: 'Kỳ Lương Tháng 09/2026',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-30'),
          standardWorkDays: 22,
          status: 'DRAFT',
        },
      });
      testPayrollPeriodId = period.id;

      // 2. Compute payroll
      const calcResult = await PayrollService.calculatePeriodPayroll(
        {
          periodId: testPayrollPeriodId,
          recalculate: false,
        },
        adminSession
      );

      expect(calcResult).toBeDefined();
      expect(calcResult.status).toBe('CALCULATED');
      expect(calcResult.totalEmployees).toBeGreaterThanOrEqual(1);

      // Verify mathematical precision of insurance & tax formulas with PayrollRuleEngine
      const ruleCalc = PayrollRuleEngine.calculate({
        employee: {
          contractSalary: 22000000,
          dependentsCount: 0,
          allowances: 0,
          taxExemptAllowances: 0,
        },
        attendance: {
          actualWorkDays: 22,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
          weekdayOtHours: 0,
          weekendOtHours: 0,
          holidayOtHours: 0,
          nightHours: 0,
        },
        adjustments: {
          kpiBonus: 2000000,
          otherBonuses: 5000000,
          penalties: 500000,
        },
        period: '2026-09',
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      expect(ruleCalc.insurance.social).toBe(1760000); // 8%
      expect(ruleCalc.insurance.health).toBe(330000);  // 1.5%
      expect(ruleCalc.insurance.unemployment).toBe(220000); // 1%
      expect(ruleCalc.insurance.totalEmployee).toBe(2310000); // 10.5%
      expect(ruleCalc.tax.pitTax).toBeGreaterThan(0);
      expect(ruleCalc.grossIncome).toBe(29000000); // 22M base + 2M KPI + 5M bonus

      testPayrollId = 'pr-e2e-001';
      state.payrolls.set(testPayrollId, {
        id: testPayrollId,
        periodId: testPayrollPeriodId,
        employeeId: testEmployeeId,
        contractSalary: 22000000,
        actualWorkDays: 22,
        otPay: 250000,
        kpiBonus: 2000000,
        otherBonuses: 5000000,
        allowances: 0,
        grossIncome: ruleCalc.grossIncome,
        socialInsurance: ruleCalc.insurance.social,
        healthInsurance: ruleCalc.insurance.health,
        unemploymentInsurance: ruleCalc.insurance.unemployment,
        pitTax: ruleCalc.tax.pitTax,
        totalPenalties: 500000,
        netSalary: ruleCalc.netSalary,
        paymentStatus: 'PENDING',
        period: {
          id: testPayrollPeriodId,
          code: 'PRD-2026-09',
          name: 'Kỳ Lương Tháng 09/2026',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-30'),
          standardWorkDays: 22,
          status: 'CALCULATED',
        },
        employee: state.employees.get(testEmployeeId),
        details: [],
      });
    });
  });

  // ─── STAGE 17: REVIEW PAYROLL & ADJUSTMENTS ──────────────────────────────
  describe('Stage 17 — Payroll Review Workflow', () => {
    it('17.1 should transition payroll period to REVIEW status and allow review', async () => {
      const reviewed = await PayrollWorkflowService.transitionPeriodState(
        {
          periodId: testPayrollPeriodId,
          targetStatus: 'REVIEW',
          action: 'SUBMIT_REVIEW',
          comments: 'Trình duyệt bảng lương tháng 09/2026',
        },
        hrSession
      );

      expect(reviewed.status).toBe('REVIEW');
    });
  });

  // ─── STAGE 18: APPROVE PAYROLL ───────────────────────────────────────────
  describe('Stage 18 — Approve Payroll Period', () => {
    it('18.1 should transition status to APPROVED and record financial audit log', async () => {
      const approved = await PayrollWorkflowService.transitionPeriodState(
        {
          periodId: testPayrollPeriodId,
          targetStatus: 'APPROVED',
          action: 'APPROVE',
          comments: 'Hội đồng tài chính đã ký duyệt bảng lương',
        },
        adminSession
      );

      expect(approved.status).toBe('APPROVED');
      expect(approved.approvalId).toBeDefined();
    });
  });

  // ─── STAGE 19: GENERATE PAYSLIP ──────────────────────────────────────────
  describe('Stage 19 — Generate Payslip PDF & Data Breakdown', () => {
    it('19.1 should generate complete payslip with earnings, deductions and statutory info', async () => {
      const payslipData = await PayslipService.getPayslipForPdf(testPayrollId, adminSession);

      expect(payslipData).toBeDefined();
      expect(payslipData.company.name).toBeDefined();
      expect(payslipData.employee.code).toBe('EMP-E2E-001');
      expect(payslipData.netSalary).toBeGreaterThan(0);
      expect(payslipData.earnings.baseSalary).toBe(22000000);
      expect(payslipData.deductions.socialInsurance).toBe(1760000);
    });
  });

  // ─── STAGE 20: EMPLOYEE VIEWS PAYSLIP & IDOR PROTECTION ─────────────────
  describe('Stage 20 — Employee Self-Service Payslip & Anti-IDOR Security', () => {
    it('20.1 should allow employee to view their own payslip', async () => {
      const payslips = await PayslipService.getMyPayslips(employeeSession);

      expect(payslips).toBeDefined();
      expect(Array.isArray(payslips)).toBe(true);
      expect(payslips.length).toBeGreaterThanOrEqual(1);
      const myPayslip = payslips[0];
      expect(myPayslip.employee.employeeCode).toBe('EMP-E2E-001');
      expect(myPayslip.netSalary).toBeGreaterThan(0);
    });

    it('20.2 should strictly BLOCK IDOR: non-admin employee cannot view others payslip', async () => {
      const unauthorizedEmployee: UserSession = {
        userId: 'usr-other-e2e',
        employeeId: 'emp-other-e2e',
        email: 'other@antigravity.corp',
        fullName: 'Other Employee',
        roles: ['employee'],
        permissions: ['payroll:self'],
        isActive: true,
      };

      await expect(
        PayslipService.getPayslipForPdf(testPayrollId, unauthorizedEmployee)
      ).rejects.toThrow(ApiError);
    });
  });
});
