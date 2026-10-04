import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TIME_ZONE,
  addBusinessDays,
  formatBusinessDate,
  getBusinessDateString,
  getBusinessTimeMinutes,
  getBusinessWeekday,
  parseBusinessDate,
  parseBusinessLocalDateTime,
} from '@/lib/time/business-time';

describe('Vietnam business time', () => {
  it('uses the canonical Vietnam timezone', () => {
    expect(BUSINESS_TIME_ZONE).toBe('Asia/Ho_Chi_Minh');
  });

  it.each([
    ['2026-09-29T17:00:00.000Z', '2026-09-30', 0],
    ['2026-09-29T17:30:00.000Z', '2026-09-30', 30],
    ['2026-09-29T23:59:59.000Z', '2026-09-30', 6 * 60 + 59],
    ['2026-09-30T00:00:00.000Z', '2026-09-30', 7 * 60],
    ['2026-09-30T16:59:59.000Z', '2026-09-30', 23 * 60 + 59],
  ])('maps %s to Vietnam date %s and expected wall-clock minutes', (iso, date, minutes) => {
    const instant = new Date(iso);
    expect(getBusinessDateString(instant)).toBe(date);
    expect(getBusinessTimeMinutes(instant)).toBe(minutes);
  });

  it('handles month and year rollover', () => {
    expect(getBusinessDateString(new Date('2026-01-31T17:30:00.000Z'))).toBe('2026-02-01');
    expect(getBusinessDateString(new Date('2026-12-31T17:30:00.000Z'))).toBe('2027-01-01');
    expect(addBusinessDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('uses a deterministic UTC-midnight carrier for PostgreSQL DATE', () => {
    const carrier = parseBusinessDate('2026-09-30');
    expect(carrier.toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(formatBusinessDate(carrier)).toBe('2026-09-30');
    expect(getBusinessWeekday('2026-09-30')).toBe(3);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-00-10', 'not-a-date'])(
    'rejects invalid business date %s',
    (value) => {
      expect(() => parseBusinessDate(value)).toThrow(RangeError);
    }
  );

  it('parses Vietnam wall-clock time without using the host timezone', () => {
    expect(parseBusinessLocalDateTime('2026-09-30', '08:30').toISOString()).toBe(
      '2026-09-30T01:30:00.000Z'
    );
  });

  it('preserves explicit offset and Z instants', () => {
    expect(parseBusinessLocalDateTime('2026-09-30T08:30:00+07:00').toISOString()).toBe(
      '2026-09-30T01:30:00.000Z'
    );
    expect(parseBusinessLocalDateTime('2026-09-30T01:30:00Z').toISOString()).toBe(
      '2026-09-30T01:30:00.000Z'
    );
  });
});
