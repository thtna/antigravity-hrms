import { describe, expect, it } from 'vitest';
import { formatClientBusinessDate } from '@/lib/time/client-business-date-display';

describe('client business DATE display', () => {
  it('formats canonical business dates without interpreting them as instants', () => {
    expect(formatClientBusinessDate('2026-10-01')).toBe('01/10/2026');
    expect(formatClientBusinessDate('2024-02-29')).toBe('29/02/2024');
  });

  it('formats the exact PostgreSQL DATE JSON carrier', () => {
    expect(formatClientBusinessDate('2026-10-01T00:00:00.000Z')).toBe('01/10/2026');
  });

  it('rejects impossible calendar dates', () => {
    expect(() => formatClientBusinessDate('2026-02-30')).toThrow(RangeError);
  });

  it('rejects non-midnight and offset timestamps', () => {
    expect(() => formatClientBusinessDate('2026-10-01T01:30:00.000Z')).toThrow(RangeError);
    expect(() => formatClientBusinessDate('2026-10-01T00:00:00+07:00')).toThrow(RangeError);
  });

  it.each(['', 'not-a-date', '2026-10-1', '01/10/2026'])('rejects malformed value %j', (value) => {
    expect(() => formatClientBusinessDate(value)).toThrow(RangeError);
  });

  it.each([null, undefined, new Date('2026-10-01T00:00:00.000Z')])(
    'rejects unsupported runtime value %j',
    (value) => {
      expect(() => formatClientBusinessDate(value as unknown as string)).toThrow(RangeError);
    }
  );
});
