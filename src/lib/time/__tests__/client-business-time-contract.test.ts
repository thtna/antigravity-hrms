import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('D2A client business-date source contract', () => {
  it('uses the approved range helpers for attendance and reports', () => {
    const attendancePage = readSource('src/app/attendance/page.tsx');
    const reportsClient = readSource('src/components/reports/ReportsClient.tsx');

    expect(attendancePage).toContain('getClientBusinessMonthRange()');
    expect(attendancePage).not.toContain("start.toISOString().split('T')[0]");
    expect(attendancePage).not.toContain("end.toISOString().split('T')[0]");

    expect(reportsClient).toContain('getClientBusinessWeekToDateRange()');
    expect(reportsClient).toContain('getClientBusinessMonthRange(undefined, -1)');
    expect(reportsClient).not.toContain('const toDateString =');
    expect(reportsClient).not.toContain("new Date().toISOString().slice(0, 10)");
  });

  it('does not derive approved current-date defaults from UTC ISO strings', () => {
    const paths = [
      'src/components/attendance/ManualAttendanceModal.tsx',
      'src/components/attendance/CorrectionRequestModal.tsx',
      'src/components/shifts/ShiftModal.tsx',
      'src/components/shifts/ScheduleModal.tsx',
      'src/components/employee/EmployeeFormModal.tsx',
      'src/components/leaves/LeaveRequestModal.tsx',
    ];

    for (const path of paths) {
      expect(readSource(path)).not.toContain("new Date().toISOString().split('T')[0]");
    }
  });

  it('uses canonical business-day offsets and weekday selection in shift UI', () => {
    const shiftsPage = readSource('src/app/shifts/page.tsx');
    const scheduleModal = readSource('src/components/shifts/ScheduleModal.tsx');

    expect(shiftsPage).toContain('addBusinessDays(today, -3)');
    expect(shiftsPage).toContain('addBusinessDays(today, 7)');
    expect(shiftsPage).toContain('getBusinessWeekday(item.workDate)');
    expect(shiftsPage).not.toContain('new Date(item.workDate)');
    expect(scheduleModal).toContain('addBusinessDays(today, 7)');
  });

  it('preserves populated employee DATE carriers and absolute upload instants', () => {
    const employeeForm = readSource('src/components/employee/EmployeeFormModal.tsx');

    expect(employeeForm).toContain(
      "new Date(initialData.dob).toISOString().split('T')[0]"
    );
    expect(employeeForm).toContain(
      "new Date(initialData.hireDate).toISOString().split('T')[0]"
    );
    expect(employeeForm).toContain('uploadedAt: new Date().toISOString()');
  });
});
