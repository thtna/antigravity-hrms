import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  formatBusinessTime,
  getBusinessDateString,
  getBusinessWeekday,
} from '@/lib/time/business-time';
import {
  getClientBusinessMonthRange,
  getClientBusinessWeekToDateRange,
} from '@/lib/time/client-business-time';

describe('client business date helpers', () => {
  it('uses the Vietnam business date across the UTC rollover', () => {
    const instant = '2026-09-30T18:00:00Z';

    expect(getBusinessDateString(instant)).toBe('2026-10-01');
    expect(getBusinessDateString(instant).slice(0, 7)).toBe('2026-10');
    expect(getClientBusinessMonthRange(instant)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
    expect(getClientBusinessWeekToDateRange(instant)).toEqual({
      startDate: '2026-09-28',
      endDate: '2026-10-01',
    });
  });

  it('handles the Vietnam business year rollover', () => {
    const instant = '2025-12-31T18:00:00Z';

    expect(getBusinessDateString(instant)).toBe('2026-01-01');
    expect(getBusinessDateString(instant).slice(0, 7)).toBe('2026-01');
    expect(getClientBusinessMonthRange(instant)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
  });

  it('returns the complete previous business month', () => {
    expect(getClientBusinessMonthRange('2026-09-30T18:00:00Z', -1)).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
  });

  it('uses Monday as the start of a week-to-date range', () => {
    expect(getClientBusinessWeekToDateRange('2026-10-04T17:00:00Z')).toEqual({
      startDate: '2026-10-05',
      endDate: '2026-10-05',
    });
  });

  it('supports canonical day offsets and weekdays without host timezone dependence', () => {
    const today = getBusinessDateString('2026-09-30T18:00:00Z');

    expect(addBusinessDays(today, -3)).toBe('2026-09-28');
    expect(addBusinessDays(today, 7)).toBe('2026-10-08');
    expect(getBusinessWeekday('2026-10-01')).toBe(4);
  });

  it('preserves canonical date and month strings', () => {
    const date = '2026-10-01';
    const month = '2026-10';

    expect(getBusinessDateString(date)).toBe(date);
    expect(getBusinessDateString(date).slice(0, 7)).toBe(month);
    expect(addBusinessDays(date, 0)).toBe(date);
  });

  it('preserves the existing Vietnam absolute-instant formatter contract', () => {
    expect(formatBusinessTime('2026-09-02T01:30:00Z')).toBe('08:30:00');
  });

  it('rejects non-integer month offsets', () => {
    expect(() => getClientBusinessMonthRange('2026-10-01', 0.5)).toThrow(RangeError);
  });
});
