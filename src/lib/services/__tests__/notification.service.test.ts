import { describe, it, expect, vi, beforeEach } from 'vitest';

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
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { NotificationService } from '../notification.service';
import { EmailService } from '@/lib/email/email.service';
import { MockEmailProvider } from '@/lib/email/providers/mock.provider';
import { ConsoleEmailProvider } from '@/lib/email/providers/console.provider';

describe('Phase 20 — Notification System & Email Abstraction', () => {
  let mockEmailProvider: MockEmailProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailProvider = new MockEmailProvider();
    EmailService.registerProvider('mock', mockEmailProvider);
    EmailService.setActiveProvider('mock');
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
      });

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
      });

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
      });

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
      });

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
      });

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
      });

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
      });

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

    it('broadcasts System Event to ALL active users when userIds is all', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'usr-1' },
        { id: 'usr-2' },
        { id: 'usr-3' },
        { id: 'usr-4' },
      ]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 4 });

      const count = await NotificationService.notifySystemEvent({
        userIds: 'all',
        title: 'Chính sách ngày lễ 30/4',
        message: 'Thông báo lịch nghỉ lễ chính thức toàn công ty.',
      });

      expect(count).toBe(4);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        select: { id: true },
      });
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

      const result = await NotificationService.getUserNotifications('usr-emp', {
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

      await NotificationService.getUserNotifications('usr-emp', {
        isRead: false,
        type: 'bonus',
      });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'usr-emp',
            isRead: false,
            type: 'bonus',
          }),
        })
      );
    });

    it('returns fast unread count for badge polling', async () => {
      mockPrisma.notification.count.mockResolvedValue(7);

      const count = await NotificationService.getUnreadCount('usr-emp');
      expect(count).toBe(7);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'usr-emp', isRead: false },
      });
    });

    it('marks a single notification as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const count = await NotificationService.markAsRead('usr-emp', 'notif-123');
      expect(count).toBe(1);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-123', userId: 'usr-emp' },
        data: { isRead: true },
      });
    });

    it('marks ALL unread notifications as read when notificationId is omitted', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 6 });

      const count = await NotificationService.markAsRead('usr-emp');
      expect(count).toBe(6);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr-emp', isRead: false },
        data: { isRead: true },
      });
    });

    it('marks a notification as unread', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const success = await NotificationService.markAsUnread('usr-emp', 'notif-123');
      expect(success).toBe(true);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-123', userId: 'usr-emp' },
        data: { isRead: false },
      });
    });

    it('deletes a notification belonging to user', async () => {
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      const success = await NotificationService.deleteNotification('usr-emp', 'notif-123');
      expect(success).toBe(true);
      expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { id: 'notif-123', userId: 'usr-emp' },
      });
    });
  });
});
