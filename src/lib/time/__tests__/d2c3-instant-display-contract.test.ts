import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('D2C3 instant display source contract', () => {
  it('formats bonus approval instants and preserves the period and nullable guard', () => {
    const source = readSource('src/app/bonus/page.tsx');

    expect(source).toContain('formatClientBusinessInstantDate(bonus.approvedAt)');
    expect(source).toContain('bonus.approvedAt && (');
    expect(source).toContain('{bonus.period}');
    expect(source).not.toContain(
      "new Date(bonus.approvedAt).toLocaleDateString('vi-VN')"
    );
    expect(source).not.toContain('formatClientBusinessDate(bonus.approvedAt)');
  });

  it('formats bonus audit creation instants with seconds', () => {
    const source = readSource('src/components/bonus/BonusAuditModal.tsx');

    expect(source).toContain('formatClientBusinessInstantDateTime(log.createdAt)');
    expect(source).not.toContain("new Date(log.createdAt).toLocaleString('vi-VN')");
    expect(source).not.toContain('formatClientBusinessDate(log.createdAt)');
  });

  it('formats penalty approval instants while preserving DATE and period semantics', () => {
    const source = readSource('src/app/penalties/page.tsx');

    expect(source).toContain('formatClientBusinessInstantDate(pen.approvedAt)');
    expect(source).toContain('pen.approvedAt && (');
    expect(source).toContain('formatClientBusinessDate(pen.effectiveDate)');
    expect(source).toContain('{pen.period}');
    expect(source).not.toContain(
      "new Date(pen.approvedAt).toLocaleDateString('vi-VN')"
    );
    expect(source).not.toContain('formatClientBusinessDate(pen.approvedAt)');
    expect(source).not.toContain('formatClientBusinessInstantDate(pen.effectiveDate)');
  });

  it('formats penalty audit creation instants with seconds', () => {
    const source = readSource('src/components/penalty/PenaltyAuditModal.tsx');

    expect(source).toContain('formatClientBusinessInstantDateTime(log.createdAt)');
    expect(source).not.toContain("new Date(log.createdAt).toLocaleString('vi-VN')");
    expect(source).not.toContain('formatClientBusinessDate(log.createdAt)');
  });

  it('formats payroll workflow action instants while preserving periodCode', () => {
    const source = readSource('src/components/payroll/PayrollWorkflowStepper.tsx');

    expect(source).toContain('formatClientBusinessInstantDateTime(item.actionAt)');
    expect(source).toContain('periodCode');
    expect(source).not.toContain("new Date(item.actionAt).toLocaleString('vi-VN')");
    expect(source).not.toContain('formatClientBusinessDate(item.actionAt)');
  });

  it('separates employee instant displays from DATE-only fields', () => {
    const source = readSource('src/components/employee/EmployeeDetailModal.tsx');

    expect(source).toContain('formatClientBusinessInstantDate(doc.uploadedAt)');
    expect(source).toContain('formatClientBusinessInstantDate(employee.createdAt)');
    expect(source).toContain('formatClientBusinessDate(employee.dob)');
    expect(source).toContain('formatClientBusinessDate(employee.hireDate)');
    expect(source).not.toContain('formatDateVN(doc.uploadedAt)');
    expect(source).not.toContain('formatDateVN(employee.createdAt)');
    expect(source).not.toContain('formatClientBusinessDate(doc.uploadedAt)');
    expect(source).not.toContain('formatClientBusinessDate(employee.createdAt)');
    expect(source).not.toContain('formatClientBusinessInstantDate(employee.dob)');
    expect(source).not.toContain('formatClientBusinessInstantDate(employee.hireDate)');
  });
});
