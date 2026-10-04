import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('D2B2 business DATE and period source contract', () => {
  it('uses the Vietnam business month in the payroll simulator', () => {
    const source = readSource('src/components/payroll/PayrollSimulatorWidget.tsx');

    expect(source).toContain('period: getBusinessDateString().slice(0, 7)');
    expect(source).not.toContain("period: new Date().toISOString().slice(0, 7)");
  });

  it('uses business today for payroll rule defaults and preserves the safe edit path', () => {
    const source = readSource('src/components/payroll/PayrollRuleModal.tsx');

    expect(source.match(/getBusinessDateString\(\)/g)).toHaveLength(2);
    expect(source).toContain('useState(getBusinessDateString())');
    expect(source).toContain('setEffectiveFrom(getBusinessDateString())');
    expect(source).toContain(
      'new Date(ruleToEdit.effectiveFrom).toISOString().slice(0, 10)'
    );
  });

  it('uses DATE-only formatting for payroll periods and rules', () => {
    const payrollPage = readSource('src/app/payroll/page.tsx');
    const rulesPage = readSource('src/app/payroll/rules/page.tsx');

    expect(payrollPage).toContain('formatClientBusinessDate(periodDetail.startDate)');
    expect(payrollPage).toContain('formatClientBusinessDate(periodDetail.endDate)');
    expect(payrollPage).not.toContain(
      "new Date(periodDetail.startDate).toLocaleDateString('vi-VN')"
    );
    expect(payrollPage).not.toContain(
      "new Date(periodDetail.endDate).toLocaleDateString('vi-VN')"
    );
    expect(rulesPage).toContain('formatClientBusinessDate(rule.effectiveFrom)');
  });

  it('formats leave start and end as business dates without a local Date helper', () => {
    const source = readSource('src/app/leaves/page.tsx');

    expect(source).toContain('formatClientBusinessDate(item.startDate)');
    expect(source).toContain('formatClientBusinessDate(item.endDate)');
    expect(source).not.toContain('function formatDate(');
    expect(source).not.toContain('const d = new Date(str);');
  });

  it('uses DATE-only formatting for employee hire dates', () => {
    const source = readSource('src/components/employee/EmployeeTable.tsx');

    expect(source).toContain('formatClientBusinessDate(emp.hireDate)');
    expect(source).not.toContain('formatDateVN(emp.hireDate)');
  });

  it('formats employee DATE fields while preserving absolute instant paths', () => {
    const source = readSource('src/components/employee/EmployeeDetailModal.tsx');

    expect(source).toContain('formatClientBusinessDate(employee.dob)');
    expect(source).toContain('formatClientBusinessDate(employee.hireDate)');
    expect(source).toContain('formatClientBusinessInstantDate(doc.uploadedAt)');
    expect(source).toContain('formatClientBusinessInstantDate(employee.createdAt)');
  });
});
