import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const d2c1Paths = [
  'src/lib/time/client-business-instant.ts',
  'src/app/attendance/page.tsx',
  'src/components/attendance/AttendanceWidget.tsx',
  'src/components/attendance/AttendanceDetailModal.tsx',
  'src/components/attendance/CorrectionProcessModal.tsx',
  'src/components/attendance/CorrectionAuditTrailModal.tsx',
  'src/components/attendance/QrScannerModal.tsx',
  'src/app/attendance/qr-kiosk/page.tsx',
];

describe('D2C1 instant display source contract', () => {
  it('preserves attendance D2A ranges and DATE-only workDate rendering', () => {
    const source = readSource('src/app/attendance/page.tsx');

    expect(source).toContain("import { getClientBusinessMonthRange } from '@/lib/time/client-business-time';");
    expect(source).toContain('const defaultDates = getAttendanceDefaultDates();');
    expect(source).toContain('useState(defaultDates.startDate)');
    expect(source).toContain('useState(defaultDates.endDate)');
    expect(source.match(/\{item\.workDate\}/g)).toHaveLength(3);
    expect(source.match(/formatClientBusinessInstantTime\(item\.(?:checkInTime|checkOutTime|requestedCheckIn|requestedCheckOut)\)/g)).toHaveLength(6);
    expect(source).not.toContain("new Date(item.checkInTime).toLocaleTimeString('vi-VN')");
    expect(source).not.toContain("new Date(item.checkOutTime).toLocaleTimeString('vi-VN')");
    expect(source).not.toContain("new Date(item.requestedCheckIn).toLocaleTimeString('vi-VN')");
    expect(source).not.toContain("new Date(item.requestedCheckOut).toLocaleTimeString('vi-VN')");
  });

  it('preserves the AttendanceWidget live clock and nullable placeholders', () => {
    const source = readSource('src/components/attendance/AttendanceWidget.tsx');

    expect(source).toContain('const now = new Date();');
    expect(source).toContain('setInterval(updateTime, 1000)');
    expect(source).toContain('setCurrentTime(formatClientBusinessInstantTime(now))');
    expect(source).toContain('setCurrentDateString(formatClientBusinessInstantLongDate(now))');
    expect(source).toContain("formatClientBusinessInstantTime(todayData.checkInTime) : '—'");
    expect(source).toContain("formatClientBusinessInstantTime(todayData.checkOutTime) : 'Chưa ra'");
  });

  it('uses strict detail formatting while preserving DATE-only workDate and placeholders', () => {
    const source = readSource('src/components/attendance/AttendanceDetailModal.tsx');

    expect(source).toContain("if (!timeStr) return '—';");
    expect(source).toContain('return formatClientBusinessInstantTime(timeStr);');
    expect(source).toContain('record.workDate');
  });

  it('keeps correction overrides while rendering requested times to minute precision', () => {
    const source = readSource('src/components/attendance/CorrectionProcessModal.tsx');

    expect(source).toContain("if (!isoString) return '--:--';");
    expect(source).toContain(
      "formatClientBusinessInstantTime(isoString, { precision: 'minute' })"
    );
    expect(source).toContain('payload.overrideCheckIn = `${correction.workDate}T${overrideCheckIn}:00`;');
    expect(source).toContain('payload.overrideCheckOut = `${correction.workDate}T${overrideCheckOut}:00`;');
    expect(source).toContain('{correction.workDate}');
  });

  it('preserves audit and QR scan seconds through strict instant formatters', () => {
    const audit = readSource('src/components/attendance/CorrectionAuditTrailModal.tsx');
    const scanner = readSource('src/components/attendance/QrScannerModal.tsx');

    expect(audit).toContain('formatClientBusinessInstantDateTime(log.createdAt)');
    expect(scanner).toContain('formatClientBusinessInstantTime(successResult.scannedAt)');
  });

  it('preserves the kiosk live clock and initial placeholders', () => {
    const source = readSource('src/app/attendance/qr-kiosk/page.tsx');

    expect(source.match(/setCurrentTime\(new Date\(\)\)/g)).toHaveLength(2);
    expect(source).toContain('setInterval(() => {');
    expect(source).toContain('}, 1000)');
    expect(source).toContain("formatClientBusinessInstantTime(currentTime) : '--:--:--'");
    expect(source).toContain("formatClientBusinessInstantLongDate(currentTime) : ''");
  });

  it('does not use the DATE-only helper for D2C1 instant fields', () => {
    for (const path of d2c1Paths) {
      expect(readSource(path)).not.toContain('formatClientBusinessDate(');
    }
  });
});
