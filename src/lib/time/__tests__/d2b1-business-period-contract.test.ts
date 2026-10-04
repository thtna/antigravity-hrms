import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('D2B1 business period and DATE display source contract', () => {
  it('uses the business month on the bonus page', () => {
    const source = readSource('src/app/bonus/page.tsx');

    expect(source).toContain('const currentPeriod = getBusinessDateString().slice(0, 7);');
    expect(source).not.toContain("const currentPeriod = new Date().toISOString().slice(0, 7);");
    expect(source).toContain('formatClientBusinessInstantDate(bonus.approvedAt)');
  });

  it('uses one business date for bonus creation defaults', () => {
    const source = readSource('src/components/bonus/BonusCreateModal.tsx');

    expect(source).toContain('const businessToday = getBusinessDateString();');
    expect(source).toContain('const currentPeriod = defaultPeriod || businessToday.slice(0, 7);');
    expect(source).toContain('const todayStr = businessToday;');
  });

  it('uses the business month and DATE-only formatter on the penalties page', () => {
    const source = readSource('src/app/penalties/page.tsx');

    expect(source).toContain('const currentPeriod = getBusinessDateString().slice(0, 7);');
    expect(source).toContain('formatClientBusinessDate(pen.effectiveDate)');
    expect(source).toContain('formatClientBusinessInstantDate(pen.approvedAt)');
  });

  it('uses one business date for penalty creation defaults', () => {
    const source = readSource('src/components/penalty/PenaltyCreateModal.tsx');

    expect(source).toContain('const businessToday = getBusinessDateString();');
    expect(source).toContain('const currentPeriod = defaultPeriod || businessToday.slice(0, 7);');
    expect(source).toContain('const todayStr = businessToday;');
  });

  it('uses the business month on the KPI page and assignment fallback', () => {
    const page = readSource('src/app/kpi/page.tsx');
    const modal = readSource('src/components/kpi/KpiAssignmentModal.tsx');

    expect(page).toContain('const currentPeriod = getBusinessDateString().slice(0, 7);');
    expect(modal).toContain(
      'const currentPeriod = defaultPeriod || getBusinessDateString().slice(0, 7);'
    );
  });
});
