import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  notification: {
    create: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
  organizationMember: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth/guard', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/email/providers/sendgrid.provider', () => ({
  SendGridEmailProvider: class { name = 'sendgrid'; isConfigured() { return false; } },
}));
vi.mock('@/lib/email/providers/resend.provider', () => ({
  ResendEmailProvider: class { name = 'resend'; isConfigured() { return false; } },
}));
vi.mock('@/lib/email/providers/smtp.provider', () => ({
  SmtpEmailProvider: class { name = 'smtp'; isConfigured() { return false; } },
}));

import { NotificationService } from '../notification.service';
import { EmailService } from '@/lib/email/email.service';
import { MockEmailProvider } from '@/lib/email/providers/mock.provider';
import { requireAuth } from '@/lib/auth/guard';
import type { UserSession } from '@/types';
import { NextRequest } from 'next/server';
import { GET as listNotifications, POST as publishNotification } from '@/app/api/v1/notifications/route';
import { POST as readNotification } from '@/app/api/v1/notifications/read/route';
import { POST as unreadNotification } from '@/app/api/v1/notifications/unread/route';
import { GET as unreadCount } from '@/app/api/v1/notifications/unread-count/route';
import { DELETE as deleteNotification } from '@/app/api/v1/notifications/[id]/route';

const tenantSession: UserSession = {
  userId: 'usr-admin', organizationId: 'org-a', fullName: 'Test admin',
  email: 'admin@antigravity.internal', roles: ['admin'], permissions: ['*'], isActive: true,
};
const employeeSession: UserSession = { ...tenantSession, userId: 'usr-emp', roles: ['employee'] };
type MemberFixture = {
  userId: string; organizationId: string; role: string; isActive: boolean;
  user: { id: string; email: string; isActive: boolean; deletedAt: Date | null };
  organization: { status: string; deletedAt: Date | null };
};
type NotificationFixture = {
  id: string; organizationId: string | null; userId: string; isRead: boolean;
  title: string; message: string; type: string; createdAt: Date;
};

function member(userId: string, organizationId = 'org-a', role = 'EMPLOYEE'): MemberFixture {
  return {
    userId, organizationId, role, isActive: true,
    user: { id: userId, email: `${userId.replace('usr-', '')}@antigravity.internal`, isActive: true, deletedAt: null },
    organization: { status: 'ACTIVE', deletedAt: null },
  };
}

function request(path: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/v1/notifications${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('Phase 20 — Notification System & Email Abstraction', () => {
  let mockEmailProvider: MockEmailProvider;
  let members: MemberFixture[];
  let notifications: NotificationFixture[];

  function matchingNotifications(where: Record<string, unknown>) {
    return notifications.filter((row) => Object.entries(where).every(([key, value]) =>
      row[key as keyof NotificationFixture] === value));
  }

  function expectNoDelivery() {
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
    expect(mockEmailProvider.getSentEmails()).toHaveLength(0);
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Real network forbidden in notification tests'); }));
    members = [member('usr-admin', 'org-a', 'ADMIN'), member('usr-emp'), member('usr-mgr'),
      ...['usr-1', 'usr-2', 'usr-3', 'usr-4'].map((id) => member(id)),
      member('usr-emp', 'org-b'), member('usr-foreign', 'org-b')];
    notifications = ['org-a', 'org-b', null].map((organizationId, index) => ({
      id: `scope-${index}`, organizationId, userId: 'usr-emp', isRead: false,
      title: 'Scoped notification', message: 'Fixture', type: 'system_event', createdAt: new Date(),
    }));
    mockPrisma.organizationMember.findFirst.mockImplementation(async ({ where }) => members.find((entry) =>
      entry.userId === where.userId && entry.organizationId === where.organizationId &&
      entry.isActive === where.isActive && entry.user.isActive === where.user.isActive &&
      entry.user.deletedAt === where.user.deletedAt && entry.organization.status === where.organization.status &&
      entry.organization.deletedAt === where.organization.deletedAt) ?? null);
    mockPrisma.organizationMember.findMany.mockImplementation(async ({ where }) => members.filter((entry) =>
      entry.organizationId === where.organizationId && entry.isActive === where.isActive &&
      entry.user.isActive === where.user.isActive && entry.user.deletedAt === where.user.deletedAt &&
      (!where.userId || where.userId.in.includes(entry.userId))).map(({ user }) => ({ user })));
    mockPrisma.notification.findMany.mockImplementation(async ({ where, skip = 0, take = 20 }) =>
      matchingNotifications(where).slice(skip, skip + take));
    mockPrisma.notification.count.mockImplementation(async ({ where }) => matchingNotifications(where).length);
    mockPrisma.notification.updateMany.mockImplementation(async ({ where, data }) => {
      const rows = matchingNotifications(where);
      rows.forEach((row) => { row.isRead = data.isRead; });
      return { count: rows.length };
    });
    mockPrisma.notification.deleteMany.mockImplementation(async ({ where }) => {
      const rows = matchingNotifications(where);
      notifications = notifications.filter((row) => !rows.includes(row));
      return { count: rows.length };
    });
    mockPrisma.notification.create.mockImplementation(async ({ data }) => ({ id: 'created', ...data }));
    mockPrisma.notification.createMany.mockImplementation(async ({ data }) => ({ count: data.length }));
    vi.mocked(requireAuth).mockResolvedValue(tenantSession);
    EmailService.init();
    mockEmailProvider = new MockEmailProvider();
    EmailService.registerProvider('mock', mockEmailProvider);
    EmailService.setActiveProvider('mock');
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  describe('R3 live tenant authority and recipients', () => {
    const input = { userId: 'usr-emp', title: 'Tenant notice', message: 'Fixture', type: 'system_event' as const, sendEmail: true };

    it.each(['OWNER', 'ADMIN', 'HR_MANAGER'])('permits live %s independently of JWT roles', async (role) => {
      members[0].role = role;
      vi.mocked(requireAuth).mockResolvedValue({ ...tenantSession, roles: ['employee'], permissions: [] });
      const response = await publishNotification(request('', input));
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ success: true, data: { organizationId: 'org-a', userId: 'usr-emp' } });
      expect(mockEmailProvider.getLastEmail()?.to).toBe('emp@antigravity.internal');
    });

    it.each(['MANAGER', 'EMPLOYEE'])('denies downgraded live %s despite stale Admin wildcard JWT', async (role) => {
      members[0].role = role;
      const response = await publishNotification(request('', { userIds: 'all', title: 'Notice', message: 'Fixture' }));
      expect(response.status).toBe(403);
      expect(mockPrisma.organizationMember.findMany).not.toHaveBeenCalled();
      expectNoDelivery();
    });

    it.each(['revoked', 'inactive', 'user-inactive', 'user-deleted', 'org-inactive', 'org-deleted'])('rejects %s actor before side effects', async (state) => {
      const actor = members[0];
      if (state === 'revoked') members.shift();
      if (state === 'inactive') actor.isActive = false;
      if (state === 'user-inactive') actor.user.isActive = false;
      if (state === 'user-deleted') actor.user.deletedAt = new Date();
      if (state === 'org-inactive') actor.organization.status = 'SUSPENDED';
      if (state === 'org-deleted') actor.organization.deletedAt = new Date();
      await expect(NotificationService.createNotification(input, tenantSession)).rejects.toMatchObject({ statusCode: 403 });
      await expect(NotificationService.getUnreadCount(tenantSession)).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.notification.count).not.toHaveBeenCalled();
      expectNoDelivery();
    });

    it.each([undefined, '', '   ', null])('rejects absent tenant %s including Platform sessions', async (organizationId) => {
      const session = { ...tenantSession, organizationId, roles: ['super_admin'] } as UserSession;
      await expect(NotificationService.createNotification(input, session)).rejects.toMatchObject({ statusCode: 403 });
      await expect(NotificationService.notifySystemEvent({ userIds: 'all', title: 'Global', message: 'Denied' }, session)).rejects.toMatchObject({ statusCode: 403 });
      await expect(NotificationService.getUserNotifications(session)).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.organizationMember.findFirst).not.toHaveBeenCalled();
      expectNoDelivery();
    });

    it('rejects forged tenant context and inactive session identity', async () => {
      for (const session of [{ ...tenantSession, organizationId: 'org-b' }, { ...tenantSession, isActive: false }]) {
        await expect(NotificationService.createNotification(input, session)).rejects.toMatchObject({ statusCode: 403 });
      }
      expectNoDelivery();
    });

    it.each(['foreign', 'missing', 'inactive-membership', 'inactive-user', 'deleted-user'])('rejects %s single recipient before insert/email', async (state) => {
      let userId = 'usr-emp';
      const recipient = members[1];
      if (state === 'foreign') userId = 'usr-foreign';
      if (state === 'missing') userId = 'missing';
      if (state === 'inactive-membership') recipient.isActive = false;
      if (state === 'inactive-user') recipient.user.isActive = false;
      if (state === 'deleted-user') recipient.user.deletedAt = new Date();
      await expect(NotificationService.createNotification({ ...input, userId }, tenantSession)).rejects.toMatchObject({ statusCode: 403 });
      expectNoDelivery();
    });

    it.each(['usr-foreign', 'missing', ''])('rejects the entire array containing %s', async (userId) => {
      await expect(NotificationService.notifySystemEvent({ userIds: ['usr-emp', userId], title: 'Notice', message: 'Fixture' }, tenantSession)).rejects.toMatchObject({ statusCode: userId ? 403 : 400 });
      expectNoDelivery();
    });

    it('deduplicates explicit recipients before delivery', async () => {
      const count = await NotificationService.notifySystemEvent({ userIds: ['usr-emp', 'usr-emp', 'usr-mgr'], title: 'Notice', message: 'Fixture' }, tenantSession);
      expect(count).toBe(2);
      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({ data: [
        expect.objectContaining({ userId: 'usr-emp', organizationId: 'org-a' }),
        expect.objectContaining({ userId: 'usr-mgr', organizationId: 'org-a' }),
      ] });
      expect(mockEmailProvider.getSentEmails()).toHaveLength(0);
    });

    it('broadcasts all only to unique eligible current-tenant members', async () => {
      members.push(member('usr-inactive'), member('usr-deleted'), member('usr-revoked'));
      members.find((entry) => entry.userId === 'usr-inactive')!.user.isActive = false;
      members.find((entry) => entry.userId === 'usr-deleted')!.user.deletedAt = new Date();
      members.find((entry) => entry.userId === 'usr-revoked')!.isActive = false;
      members.push({ ...members[1] });
      const response = await publishNotification(request('', { userIds: 'all', title: 'Notice', message: 'Fixture', organizationId: 'org-b' }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, data: { broadcastCount: 7 } });
      const data = mockPrisma.notification.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(7);
      expect(new Set(data.map((row: { userId: string }) => row.userId)).size).toBe(7);
      expect(data.every((row: { organizationId: string }) => row.organizationId === 'org-a')).toBe(true);
      expect(data.map((row: { userId: string }) => row.userId)).not.toContain('usr-foreign');
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it.each([true, false])('rejects email mismatch before insert (sendEmail=%s)', async (sendEmail) => {
      await expect(NotificationService.createNotification({ ...input, sendEmail, emailRecipient: 'outside@example.invalid' }, tenantSession)).rejects.toMatchObject({ statusCode: 400 });
      expectNoDelivery();
    });

    it.each([undefined, ' EMP@ANTIGRAVITY.INTERNAL '])('uses authoritative normalized email (override=%s)', async (emailRecipient) => {
      members[1].user.email = ' Emp@Antigravity.Internal ';
      await NotificationService.createNotification({ ...input, emailRecipient }, tenantSession);
      expect(mockEmailProvider.getSentEmails()).toHaveLength(1);
      expect(mockEmailProvider.getLastEmail()?.to).toBe('emp@antigravity.internal');
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: 'org-a', userId: 'usr-emp' }) });
    });

    it('requires context for every business wrapper', async () => {
      const session = { ...tenantSession, organizationId: undefined };
      const calls = [
        () => NotificationService.notifyLeaveRequest({ approverUserId: 'usr-mgr', requesterName: 'Test', leaveType: 'Annual', days: 1, startDate: '2026-10-10', requestId: 'leave' }, session),
        () => NotificationService.notifyLeaveApproval({ requesterUserId: 'usr-emp', approverName: 'Test', status: 'APPROVED', leaveType: 'Annual', requestId: 'leave' }, session),
        () => NotificationService.notifyAttendanceIssue({ userId: 'usr-emp', issueType: 'late', date: '2026-10-10' }, session),
        () => NotificationService.notifyBonus({ userId: 'usr-emp', employeeName: 'Test', amount: 1, reason: 'Fixture', bonusId: 'bonus' }, session),
        () => NotificationService.notifyPenalty({ userId: 'usr-emp', employeeName: 'Test', amount: 1, reason: 'Fixture', penaltyId: 'penalty' }, session),
        () => NotificationService.notifyPayroll({ userId: 'usr-emp', employeeName: 'Test', periodName: 'Fixture', netSalary: 1, payslipId: 'payroll' }, session),
      ];
      for (const call of calls) await expect(call()).rejects.toMatchObject({ statusCode: 403 });
      expectNoDelivery();
    });
  });

  describe('R3 shared-user API isolation and NULL preservation', () => {
    const sessionB = { ...employeeSession, organizationId: 'org-b' };
    beforeEach(() => { vi.mocked(requireAuth).mockResolvedValue(sessionB); });

    it.each(['org-a', 'org-b'])('scopes list/badge to %s and ignores forged query', async (organizationId) => {
      vi.mocked(requireAuth).mockResolvedValue({ ...employeeSession, organizationId });
      const response = await listNotifications(request('?organizationId=org-forged'));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.items.map((row: { id: string }) => row.id)).toEqual([organizationId === 'org-a' ? 'scope-0' : 'scope-1']);
      expect(body.data.meta).toMatchObject({ total: 1, unreadCount: 1, page: 1, limit: 20, totalPages: 1 });
      expect(await (await unreadCount(request('/unread-count'))).json()).toMatchObject({ success: true, data: { unreadCount: 1 } });
    });

    it.each(['scope-0', 'scope-2'])('cannot read/unread/delete foreign or NULL %s', async (notificationId) => {
      const original = structuredClone(notifications);
      expect(await (await readNotification(request('/read', { notificationId, organizationId: 'org-a' }))).json()).toMatchObject({ success: true, data: { updatedCount: 0 } });
      expect(await (await unreadNotification(request('/unread', { notificationId }))).json()).toMatchObject({ success: false });
      const response = await deleteNotification(request(`/${notificationId}`), { params: Promise.resolve({ id: notificationId }) });
      expect(response.status).toBe(404);
      expect(notifications).toEqual(original);
    });

    it('preserves valid read/unread/delete shapes and only changes B', async () => {
      expect(await (await readNotification(request('/read', { notificationId: 'scope-1' }))).json()).toMatchObject({ success: true, data: { updatedCount: 1 } });
      expect(await (await unreadNotification(request('/unread', { notificationId: 'scope-1' }))).json()).toMatchObject({ success: true });
      expect((await deleteNotification(request('/scope-1'), { params: Promise.resolve({ id: 'scope-1' }) })).status).toBe(200);
      expect(notifications.map(({ id, isRead }) => ({ id, isRead }))).toEqual([{ id: 'scope-0', isRead: false }, { id: 'scope-2', isRead: false }]);
    });

    it('mark-all affects B only and leaves NULL and other users unchanged', async () => {
      notifications.push({ ...notifications[1], id: 'other-user', userId: 'usr-foreign' });
      const legacy = structuredClone(notifications[2]);
      expect(await (await readNotification(request('/read', {}))).json()).toMatchObject({ success: true, data: { updatedCount: 1 } });
      expect(notifications.map(({ isRead }) => isRead)).toEqual([false, true, false, false]);
      expect(notifications[2]).toEqual(legacy);
      expect(await NotificationService.getUnreadCount(sessionB)).toBe(0);
      expect(await NotificationService.getUnreadCount(employeeSession)).toBe(1);
    });

    it('rejects revoked membership across all tenant REST readers/writers', async () => {
      members.find((entry) => entry.userId === 'usr-emp' && entry.organizationId === 'org-b')!.isActive = false;
      const responses = [await listNotifications(request('')), await unreadCount(request('/unread-count')),
        await readNotification(request('/read', {})), await unreadNotification(request('/unread', { notificationId: 'scope-1' })),
        await deleteNotification(request('/scope-1'), { params: Promise.resolve({ id: 'scope-1' }) })];
      expect(responses.map(({ status }) => status)).toEqual([403, 403, 403, 403, 403]);
      expect(mockPrisma.notification.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.count).not.toHaveBeenCalled();
      expect(mockPrisma.notification.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.deleteMany).not.toHaveBeenCalled();
      expectNoDelivery();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. EMAIL ABSTRACTION & PROVIDER REGISTRY TESTS
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Email Abstraction & Strategy Pattern Registry', () => {
    it('registers and retrieves available providers dynamically', () => {
      const providers = EmailService.getAvailableProviders();
      expect(providers).toContain('mock');
      expect(providers).toContain('console');
      expect(providers).toContain('sendgrid');
      expect(providers).toContain('smtp');
    });

    it('switches active provider without hardcoding', () => {
      EmailService.setActiveProvider('console');
      expect(EmailService.getActiveProvider().name).toBe('console');

      EmailService.setActiveProvider('mock');
      expect(EmailService.getActiveProvider().name).toBe('mock');
    });

    it('throws when switching to an unregistered provider', () => {
      expect(() => EmailService.setActiveProvider('non_existent_provider')).toThrow(
        /not registered/
      );
    });

    it('sends email successfully via active MockEmailProvider', async () => {
      const result = await EmailService.sendEmail({
        to: 'dev@antigravity.internal',
        subject: 'Thông Báo Kiểm Thử',
        html: '<p>Nội dung kiểm thử</p>',
        text: 'Nội dung kiểm thử',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('mock');
      expect(mockEmailProvider.getSentEmails()).toHaveLength(1);
      expect(mockEmailProvider.getLastEmail()?.to).toBe('dev@antigravity.internal');
      expect(mockEmailProvider.getLastEmail()?.subject).toBe('Thông Báo Kiểm Thử');
    });

    it('gracefully falls back when primary provider fails without crashing', async () => {
      mockEmailProvider.simulateFailure('Simulated connection timeout');

      // Add a fallback console provider
      const result = await EmailService.sendEmail({
        to: 'employee@antigravity.internal',
        subject: 'Cảnh Báo',
        html: '<p>Nội dung</p>',
      });

      // The service should attempt fallback rather than throw
      expect(result).toBeDefined();
    });

    it('renders a luxury HTML notification email template', () => {
      const html = EmailService.renderNotificationEmail({
        title: 'Quyết định khen thưởng Q1',
        message: 'Bạn đã hoàn thành xuất sắc dự án và được thưởng 5.000.000 đ',
        recipientName: 'Nguyễn Văn An',
        actionUrl: '/bonus',
        type: 'bonus',
      });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Nguyễn Văn An');
      expect(html).toContain('Quyết định khen thưởng Q1');
      expect(html).toContain('KHEN THƯỞNG');
      expect(html).toContain('/bonus');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. IN-APP NOTIFICATION CREATION & 7 BUSINESS EVENTS
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. In-App Notifications (7 Business Event Types)', () => {
    it('1) notifies Leave Request to approver with action link', async () => {
      mockPrisma.notification.create.mockResolvedValue({
        id: 'notif-leave-req',
        userId: 'usr-mgr',
        title: 'Đơn xin nghỉ phép mới từ Lê Văn Dev',
        message: 'Nhân viên Lê Văn Dev vừa gửi đơn xin nghỉ Phép năm (2 ngày, từ ngày 2026-03-10).',
        type: 'leave_request',
        actionUrl: '/leaves',
        isRead: false,
        createdAt: new Date(),
      });

      const notif = await NotificationService.notifyLeaveRequest({
        approverUserId: 'usr-mgr',
        approverEmail: 'mgr@antigravity.internal',
        approverName: 'Trưởng Phòng',
        requesterName: 'Lê Văn Dev',
        leaveType: 'Phép năm',
        days: 2,
        startDate: '2026-03-10',
        requestId: 'req-01',
      }, tenantSession);

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'usr-mgr',
          type: 'leave_request',
          actionUrl: '/leaves',
          isRead: false,
        }),
      });
      expect(notif.type).toBe('leave_request');
      expect(mockEmailProvider.getSentEmails()).toHaveLength(1);
    });

    it('2) notifies Leave Approval result to requester', async () => {
      mockPrisma.notification.create.mockResolvedValue({
        id: 'notif-leave-appr',
        userId: 'usr-emp',
        title: 'Đơn nghỉ phép của bạn ĐÃ ĐƯỢC DUYỆT',
        type: 'leave_approval',
        actionUrl: '/leaves',
        isRead: false,
        createdAt: new Date(),
      });

      const notif = await NotificationService.notifyLeaveApproval({
        requesterUserId: 'usr-emp',
        requesterEmail: 'emp@antigravity.internal',
        requesterName: 'Nguyễn Văn An',
        approverName: 'Trưởng Phòng Kỹ Thuật',
        status: 'APPROVED',
        leaveType: 'Nghỉ Ốm',
        requestId: 'req-02',
      }, tenantSession);

      expect(notif.type).toBe('leave_approval');
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'usr-emp',
          type: 'leave_approval',
          title: expect.stringContaining('ĐÃ ĐƯỢC DUYỆT'),
        }),
      });
    });

    it('3) notifies Attendance Issue (Late & Early Leave)', async () => {
      mockPrisma.notification.create.mockResolvedValue({
        id: 'notif-late',
        userId: 'usr-emp',
        title: 'Cảnh báo đi muộn ngày 2026-03-02',
        message: 'Bạn đã check-in trễ 35 phút vào ngày 2026-03-02.',
        type: 'attendance_issue',
        actionUrl: '/attendance',
        isRead: false,
        createdAt: new Date(),
      });

      const notif = await NotificationService.notifyAttendanceIssue({
        userId: 'usr-emp',
        issueType: 'late',
        date: '2026-03-02',
        minutes: 35,
      }, tenantSession);

      expect(notif.type).toBe('attendance_issue');
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'usr-emp',
          type: 'attendance_issue',
          title: expect.stringContaining('đi muộn'),
        }),
      });
    });

    it('4) notifies Bonus award with Vietnamese currency formatting', async () => {
      mockPrisma.notification.create.mockResolvedValue({
        id: 'notif-bonus',
        userId: 'usr-emp',
        title: 'Chúc mừng! Bạn nhận được khoản khen thưởng 5.000.000 ₫',
        type: 'bonus',
        actionUrl: '/bonus',
        isRead: false,
        createdAt: new Date(),
      });

      const notif = await NotificationService.notifyBonus({
        userId: 'usr-emp',
        employeeName: 'Nguyễn Văn An',
        amount: 5000000,
        reason: 'Đóng góp xuất sắc cho dự án Enterprise',
        bonusId: 'bon-01',
      }, tenantSession);

      expect(notif.type).toBe('bonus');
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'usr-emp',
          type: 'bonus',
          title: expect.stringContaining('5.000.000'),
          actionUrl: '/bonus',
        }),
      });
    });

    it('5) notifies Penalty deduction with Vietnamese currency formatting', async () => {
      mockPrisma.notification.create.mockResolvedValue({
        id: 'notif-penalty',
        userId: 'usr-emp',
        title: 'Thông báo quyết định kỷ luật & phạt (200.000 ₫)',
        type: 'penalty',
        actionUrl: '/penalties',
        isRead: false,
        createdAt: new Date(),
      });

      const notif = await NotificationService.notifyPenalty({
        userId: 'usr-emp',
        employeeName: 'Trần Văn Bình',
        amount: 200000,
        reason: 'Đi muộn quá 3 lần trong tháng',
        penaltyId: 'pen-01',
      }, tenantSession);

      expect(notif.type).toBe('penalty');
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'usr-emp',
          type: 'penalty',
          title: expect.stringContaining('200.000'),
          actionUrl: '/penalties',
        }),
      });
    });

    it('6) notifies Payroll readiness with formatted Net salary', async () => {
      mockPrisma.notification.create.mockResolvedValue({
        id: 'notif-payroll',
        userId: 'usr-emp',
        title: 'Phiếu lương Kỳ Lương Tháng 03/2026 đã sẵn sàng',
        type: 'payroll',
        actionUrl: '/my-payslips',
        isRead: false,
        createdAt: new Date(),
      });

      const notif = await NotificationService.notifyPayroll({
        userId: 'usr-emp',
        employeeName: 'Nguyễn Văn An',
        periodName: 'Kỳ Lương Tháng 03/2026',
        netSalary: 21500000,
        payslipId: 'pay-01',
      }, tenantSession);

      expect(notif.type).toBe('payroll');
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'usr-emp',
          type: 'payroll',
          actionUrl: '/my-payslips',
        }),
      });
    });

    it('7) broadcasts System Event to multiple users', async () => {
      mockPrisma.notification.createMany.mockResolvedValue({ count: 3 });

      const count = await NotificationService.notifySystemEvent({
        userIds: ['usr-1', 'usr-2', 'usr-3'],
        title: 'Bảo trì hệ thống định kỳ',
        message: 'Hệ thống sẽ bảo trì từ 23:00 đến 24:00 ngày 2026-03-05.',
      }, tenantSession);

      expect(count).toBe(3);
      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: 'usr-1',
            type: 'system_event',
          }),
        ]),
      });
    });

    it('broadcasts System Event to ALL eligible tenant members when userIds is all', async () => {
      members = members.filter(({ userId, organizationId }) => organizationId === 'org-a' && (userId === 'usr-admin' || /^usr-[1-3]$/.test(userId)));
      mockPrisma.notification.createMany.mockResolvedValue({ count: 4 });

      const count = await NotificationService.notifySystemEvent({
        userIds: 'all',
        title: 'Chính sách ngày lễ 30/4',
        message: 'Thông báo lịch nghỉ lễ chính thức toàn công ty.',
      }, tenantSession);

      expect(count).toBe(4);
      expect(mockPrisma.organizationMember.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-a', isActive: true, user: { isActive: true, deletedAt: null } },
        select: { user: { select: { id: true, email: true } } },
      });
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. READ / UNREAD STATE MANAGEMENT & QUERIES
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Read / Unread State Management', () => {
    it('retrieves paginated user notifications with total and unread counts', async () => {
      mockPrisma.notification.count
        .mockResolvedValueOnce(15) // total matching filter
        .mockResolvedValueOnce(4); // total unread for user
      mockPrisma.notification.findMany.mockResolvedValue([
        {
          id: 'n-1',
          userId: 'usr-emp',
          title: 'Đơn nghỉ phép',
          message: 'Đã duyệt',
          type: 'leave_approval',
          actionUrl: '/leaves',
          isRead: false,
          createdAt: new Date(),
        },
      ]);

      const result = await NotificationService.getUserNotifications(employeeSession, {
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(15);
      expect(result.meta.unreadCount).toBe(4);
      expect(result.meta.totalPages).toBe(2);
    });

    it('filters notifications by isRead boolean and notification type', async () => {
      mockPrisma.notification.count.mockResolvedValue(2);
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await NotificationService.getUserNotifications(employeeSession, {
        isRead: false,
        type: 'bonus',
      });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'usr-emp',
            organizationId: 'org-a',
            isRead: false,
            type: 'bonus',
          }),
        })
      );
    });

    it('returns fast unread count for badge polling', async () => {
      mockPrisma.notification.count.mockResolvedValue(7);

      const count = await NotificationService.getUnreadCount(employeeSession);
      expect(count).toBe(7);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-a', userId: 'usr-emp', isRead: false },
      });
    });

    it('marks a single notification as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const count = await NotificationService.markAsRead(employeeSession, 'notif-123');
      expect(count).toBe(1);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-123', organizationId: 'org-a', userId: 'usr-emp' },
        data: { isRead: true },
      });
    });

    it('marks ALL unread notifications as read when notificationId is omitted', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 6 });

      const count = await NotificationService.markAsRead(employeeSession);
      expect(count).toBe(6);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-a', userId: 'usr-emp', isRead: false },
        data: { isRead: true },
      });
    });

    it('marks a notification as unread', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const success = await NotificationService.markAsUnread(employeeSession, 'notif-123');
      expect(success).toBe(true);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-123', organizationId: 'org-a', userId: 'usr-emp' },
        data: { isRead: false },
      });
    });

    it('deletes a notification belonging to user', async () => {
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      const success = await NotificationService.deleteNotification(employeeSession, 'notif-123');
      expect(success).toBe(true);
      expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { id: 'notif-123', organizationId: 'org-a', userId: 'usr-emp' },
      });
    });
  });
});
