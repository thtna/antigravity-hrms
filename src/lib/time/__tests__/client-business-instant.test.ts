import { afterEach, describe, expect, it } from 'vitest';
import {
  formatClientBusinessInstantDate,
  formatClientBusinessInstantDateTime,
  formatClientBusinessInstantLongDate,
  formatClientBusinessInstantTime,
} from '@/lib/time/client-business-instant';

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe('client business instant display', () => {
  it('formats seconds and minute precision in Vietnam time', () => {
    expect(formatClientBusinessInstantTime('2026-09-02T01:30:45Z')).toBe('08:30:45');
    expect(
      formatClientBusinessInstantTime('2026-09-02T01:30:45Z', { precision: 'minute' })
    ).toBe('08:30');
  });

  it('treats equivalent offset strings and Date objects as the same instant', () => {
    const expected = '08:30:45';

    expect(formatClientBusinessInstantTime('2026-09-02T08:30:45+07:00')).toBe(expected);
    expect(formatClientBusinessInstantTime(new Date('2026-09-02T01:30:45Z'))).toBe(expected);
  });

  it('formats deterministic datetimes with seconds across the Vietnam date rollover', () => {
    expect(formatClientBusinessInstantDateTime('2026-09-02T01:30:45Z')).toBe(
      '02/09/2026 08:30:45'
    );
    expect(formatClientBusinessInstantDateTime('2026-09-30T18:30:45Z')).toBe(
      '01/10/2026 01:30:45'
    );
  });

  it('formats deterministic short dates with optional year', () => {
    expect(formatClientBusinessInstantDate('2026-09-02T01:30:45Z')).toBe('02/09/2026');
    expect(
      formatClientBusinessInstantDate('2026-09-02T01:30:45Z', { includeYear: false })
    ).toBe('02/09');
    expect(formatClientBusinessInstantDate('2026-09-30T18:30:45Z')).toBe('01/10/2026');
    expect(
      formatClientBusinessInstantDate('2026-09-30T18:30:45Z', { includeYear: false })
    ).toBe('01/10');
  });

  it('formats equivalent offset strings as the same short date', () => {
    const expected = formatClientBusinessInstantDate('2026-09-30T18:30:45Z');

    expect(formatClientBusinessInstantDate('2026-10-01T01:30:45+07:00')).toBe(expected);
  });

  it('formats the Vietnam long calendar date', () => {
    expect(formatClientBusinessInstantLongDate('2026-09-02T01:30:45Z')).toBe(
      'Thứ Tư, 2 tháng 9, 2026'
    );
  });

  it.each([undefined, 'UTC', 'America/Los_Angeles']) (
    'is independent of host timezone %s',
    (timeZone) => {
      if (timeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = timeZone;
      }

      expect(formatClientBusinessInstantTime('2026-09-30T18:30:45Z')).toBe('01:30:45');
      expect(formatClientBusinessInstantDateTime('2026-09-30T18:30:45Z')).toBe(
        '01/10/2026 01:30:45'
      );
      expect(formatClientBusinessInstantDate('2026-09-30T18:30:45Z')).toBe('01/10/2026');
      expect(
        formatClientBusinessInstantDate('2026-09-30T18:30:45Z', { includeYear: false })
      ).toBe('01/10');
      expect(formatClientBusinessInstantLongDate('2026-09-30T18:30:45Z')).toBe(
        'Thứ Năm, 1 tháng 10, 2026'
      );
    }
  );

  it.each(['2026-09-02', '2026-09-02T08:30:45', 'not-an-instant']) (
    'rejects ambiguous or malformed string %j',
    (value) => {
      expect(() => formatClientBusinessInstantTime(value)).toThrow(RangeError);
      expect(() => formatClientBusinessInstantDate(value)).toThrow(RangeError);
    }
  );

  it('rejects invalid Date objects', () => {
    expect(() => formatClientBusinessInstantTime(new Date('invalid'))).toThrow(RangeError);
    expect(() => formatClientBusinessInstantDate(new Date('invalid'))).toThrow(RangeError);
  });

  it.each([null, undefined, 1_788_315_045_000, {}, []])(
    'rejects unsupported runtime input %j',
    (value) => {
      expect(() =>
        formatClientBusinessInstantTime(value as unknown as Date | string)
      ).toThrow(RangeError);
      expect(() =>
        formatClientBusinessInstantDate(value as unknown as Date | string)
      ).toThrow(RangeError);
    }
  );
});
