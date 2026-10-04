import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const d2c2Paths = [
  'src/lib/time/client-business-instant.ts',
  'src/components/dashboard/EmployeeDashboardView.tsx',
  'src/components/dashboard/ManagerDashboardView.tsx',
  'src/components/notifications/NotificationsClient.tsx',
  'src/components/notifications/NotificationBell.tsx',
  'src/app/super-admin/page.tsx',
];

describe('D2C2 instant display source contract', () => {
  it('uses strict instant helpers for employee dashboard displays and preserves DATE-only workDate', () => {
    const source = readSource('src/components/dashboard/EmployeeDashboardView.tsx');

    expect(source).toContain(
      'formatClientBusinessInstantTime(data.todayAttendance.checkInTime)'
    );
    expect(source).toContain(
      'formatClientBusinessInstantTime(data.todayAttendance.checkOutTime)'
    );
    expect(source).toContain("checkInTime\n                  ? formatClientBusinessInstantTime");
    expect(source).toContain(": 'Chưa có'");
    expect(source).toContain(": 'Đang làm việc'");
    expect(source).toContain('formatClientBusinessInstantDate(notif.createdAt)');
    expect(source).toContain('data.todayAttendance.workDate');
    expect(source).not.toContain(
      'new Date(data.todayAttendance.checkInTime).toLocaleTimeString'
    );
    expect(source).not.toContain(
      'new Date(data.todayAttendance.checkOutTime).toLocaleTimeString'
    );
    expect(source).not.toContain('new Date(notif.createdAt).toLocaleDateString');
  });

  it('uses minute precision for manager check-in while preserving DATE-only fields', () => {
    const source = readSource('src/components/dashboard/ManagerDashboardView.tsx');

    expect(source).toMatch(
      /formatClientBusinessInstantTime\(member\.checkInTime,\s*\{\s*precision: 'minute',?\s*\}\)/
    );
    expect(source).toContain(": '—'");
    expect(source).toContain('{req.startDate} → {req.endDate}');
    expect(source).toContain('adj.workDate');
    expect(source).not.toContain('new Date(member.checkInTime).toLocaleTimeString');
  });

  it('composes notification timestamps from short date and minute time helpers', () => {
    const source = readSource('src/components/notifications/NotificationsClient.tsx');

    expect(source).toContain('formatClientBusinessInstantDate(item.createdAt)');
    expect(source).toMatch(
      /formatClientBusinessInstantTime\(item\.createdAt,\s*\{\s*precision: 'minute',?\s*\}\)/
    );
    expect(source).not.toContain('new Date(item.createdAt).toLocaleString');
  });

  it('preserves notification elapsed math and replaces only the host-local fallback', () => {
    const source = readSource('src/components/notifications/NotificationBell.tsx');

    expect(source).toContain(
      'const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);'
    );
    expect(source).toContain("if (diff < 60) return 'Vừa xong';");
    expect(source).toContain('if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;');
    expect(source).toContain(
      'if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;'
    );
    expect(source).toContain(
      'formatClientBusinessInstantDate(dateStr, { includeYear: false })'
    );
    expect(source).not.toContain('new Date(dateStr).toLocaleDateString');
  });

  it('uses the approved instant display shapes for super-admin timestamps', () => {
    const source = readSource('src/app/super-admin/page.tsx');

    expect(source).toContain('formatClientBusinessInstantDate(t.createdAt)');
    expect(source).toMatch(
      /formatClientBusinessInstantTime\(t\.createdAt,\s*\{\s*precision: 'minute',?\s*\}\)/
    );
    expect(source).toContain('formatClientBusinessInstantDateTime(log.createdAt)');
    expect(source).not.toContain('new Date(t.createdAt).toLocaleDateString');
    expect(source).not.toContain('new Date(t.createdAt).toLocaleTimeString');
    expect(source).not.toContain('new Date(log.createdAt).toLocaleString');
  });

  it('does not use the DATE-only helper for D2C2 absolute instant sites', () => {
    for (const path of d2c2Paths) {
      expect(readSource(path)).not.toContain('formatClientBusinessDate(');
    }
  });
});
