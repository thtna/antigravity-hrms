import { prisma } from '@/lib/db/prisma';
import { EmailService } from '@/lib/email/email.service';
import { logger } from '@/lib/logger';
import { ApiError } from '@/lib/errors';

export type NotificationType =
  | 'leave_request'
  | 'leave_approval'
  | 'attendance_issue'
  | 'bonus'
  | 'penalty'
  | 'payroll'
  | 'system_event';

export interface CreateNotificationInput {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  actionUrl?: string;
  sendEmail?: boolean;
  emailRecipient?: string;
  recipientName?: string;
}

export interface NotificationQueryOptions {
  isRead?: boolean;
  type?: NotificationType;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'isRead';
  sortOrder?: 'asc' | 'desc';
}

export interface NotificationListResult {
  items: Array<{
    id: string;
    userId: string;
    title: string;
    message: string;
    type: string;
    actionUrl: string | null;
    isRead: boolean;
    createdAt: Date;
  }>;
  meta: {
    total: number;
    unreadCount: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class NotificationService {
  /**
   * Dispatches a single in-app notification and optional email
   */
  static async createNotification(input: CreateNotificationInput) {
    if (!input.userId) {
      throw ApiError.badRequest('userId là bắt buộc để gửi thông báo');
    }
    if (!input.title || !input.message) {
      throw ApiError.badRequest('Tiêu đề và nội dung thông báo không được để trống');
    }

    // 1. Create In-App Notification in database
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type,
        actionUrl: input.actionUrl || null,
        isRead: false,
      },
    });

    logger.info(`[NotificationService] In-app notification created: ${notification.id} for user ${input.userId} (${input.type})`);

    // 2. Optional Email dispatch
    if (input.sendEmail && input.emailRecipient) {
      try {
        const html = EmailService.renderNotificationEmail({
          title: input.title,
          message: input.message,
          recipientName: input.recipientName,
          actionUrl: input.actionUrl,
          type: input.type,
        });

        await EmailService.sendEmail({
          to: input.emailRecipient,
          subject: input.title,
          html,
          text: input.message,
        });
      } catch (err: any) {
        // Log error but don't fail notification creation
        logger.warn(`[NotificationService] Email delivery skipped or failed for user ${input.userId}: ${err?.message}`);
      }
    }

    return notification;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 1. LEAVE REQUEST NOTIFICATION
  // ────────────────────────────────────────────────────────────────────────────
  static async notifyLeaveRequest(options: {
    approverUserId: string;
    approverEmail?: string;
    approverName?: string;
    requesterName: string;
    leaveType: string;
    days: number;
    startDate: string;
    requestId: string;
  }) {
    return this.createNotification({
      userId: options.approverUserId,
      type: 'leave_request',
      title: `Đơn xin nghỉ phép mới từ ${options.requesterName}`,
      message: `Nhân viên ${options.requesterName} vừa gửi đơn xin nghỉ ${options.leaveType} (${options.days} ngày, từ ngày ${options.startDate}). Vui lòng xem xét và phê duyệt.`,
      actionUrl: `/leaves`,
      sendEmail: Boolean(options.approverEmail),
      emailRecipient: options.approverEmail,
      recipientName: options.approverName,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2. LEAVE APPROVAL NOTIFICATION
  // ────────────────────────────────────────────────────────────────────────────
  static async notifyLeaveApproval(options: {
    requesterUserId: string;
    requesterEmail?: string;
    requesterName?: string;
    approverName: string;
    status: 'APPROVED' | 'REJECTED';
    leaveType: string;
    reason?: string;
    requestId: string;
  }) {
    const isApproved = options.status === 'APPROVED';
    const statusText = isApproved ? 'ĐÃ ĐƯỢC DUYỆT' : 'ĐÃ BỊ TỪ CHỐI';

    return this.createNotification({
      userId: options.requesterUserId,
      type: 'leave_approval',
      title: `Đơn nghỉ phép của bạn ${statusText}`,
      message: `Đơn xin nghỉ ${options.leaveType} của bạn đã được ${options.approverName} ${isApproved ? 'chấp thuận' : 'từ chối'}${options.reason ? `. Lý do: ${options.reason}` : ''}.`,
      actionUrl: `/leaves`,
      sendEmail: Boolean(options.requesterEmail),
      emailRecipient: options.requesterEmail,
      recipientName: options.requesterName,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. ATTENDANCE ISSUE NOTIFICATION
  // ────────────────────────────────────────────────────────────────────────────
  static async notifyAttendanceIssue(options: {
    userId: string;
    employeeEmail?: string;
    employeeName?: string;
    issueType: 'late' | 'early_leave' | 'missing_checkout' | 'adjustment_requested' | 'adjustment_approved';
    date: string;
    minutes?: number;
    details?: string;
  }) {
    let title = 'Cảnh báo vi phạm chấm công';
    let message = `Ghi nhận bất thường chấm công ngày ${options.date}.`;

    switch (options.issueType) {
      case 'late':
        title = `Cảnh báo đi muộn ngày ${options.date}`;
        message = `Bạn đã check-in trễ ${options.minutes || 0} phút vào ngày ${options.date}. Vui lòng tạo đơn giải trình nếu có lý do chính đáng.`;
        break;
      case 'early_leave':
        title = `Cảnh báo về sớm ngày ${options.date}`;
        message = `Bạn đã check-out sớm ${options.minutes || 0} phút vào ngày ${options.date}. Vui lòng kiểm tra lại thời gian ca làm.`;
        break;
      case 'missing_checkout':
        title = `Quên chấm công ra ngày ${options.date}`;
        message = `Hệ thống ghi nhận bạn chưa check-out cho ca làm ngày ${options.date}. Vui lòng gửi yêu cầu bổ sung công.`;
        break;
      case 'adjustment_requested':
        title = `Yêu cầu giải trình chấm công mới`;
        message = options.details || `Có đơn giải trình chấm công mới cần xử lý cho ngày ${options.date}.`;
        break;
      case 'adjustment_approved':
        title = `Đơn giải trình chấm công đã được duyệt`;
        message = `Đơn giải trình chấm công ngày ${options.date} của bạn đã được quản lý phê duyệt thành công.`;
        break;
    }

    return this.createNotification({
      userId: options.userId,
      type: 'attendance_issue',
      title,
      message,
      actionUrl: `/attendance`,
      sendEmail: Boolean(options.employeeEmail),
      emailRecipient: options.employeeEmail,
      recipientName: options.employeeName,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4. BONUS NOTIFICATION
  // ────────────────────────────────────────────────────────────────────────────
  static async notifyBonus(options: {
    userId: string;
    employeeEmail?: string;
    employeeName?: string;
    amount: number;
    reason: string;
    bonusId: string;
  }) {
    const formattedAmount = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(options.amount);

    return this.createNotification({
      userId: options.userId,
      type: 'bonus',
      title: `Chúc mừng! Bạn nhận được khoản khen thưởng ${formattedAmount}`,
      message: `Bạn vừa được quyết định khen thưởng số tiền ${formattedAmount}. Lý do: ${options.reason}. Khoản tiền này sẽ được cộng vào kỳ lương sắp tới.`,
      actionUrl: `/bonus`,
      sendEmail: Boolean(options.employeeEmail),
      emailRecipient: options.employeeEmail,
      recipientName: options.employeeName,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 5. PENALTY NOTIFICATION
  // ────────────────────────────────────────────────────────────────────────────
  static async notifyPenalty(options: {
    userId: string;
    employeeEmail?: string;
    employeeName?: string;
    amount: number;
    reason: string;
    penaltyId: string;
  }) {
    const formattedAmount = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(options.amount);

    return this.createNotification({
      userId: options.userId,
      type: 'penalty',
      title: `Thông báo quyết định kỷ luật & phạt (${formattedAmount})`,
      message: `Quyết định xử lý kỷ luật/khấu trừ ${formattedAmount} đã được ban hành. Lý do vi phạm: ${options.reason}.`,
      actionUrl: `/penalties`,
      sendEmail: Boolean(options.employeeEmail),
      emailRecipient: options.employeeEmail,
      recipientName: options.employeeName,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 6. PAYROLL NOTIFICATION
  // ────────────────────────────────────────────────────────────────────────────
  static async notifyPayroll(options: {
    userId: string;
    employeeEmail?: string;
    employeeName?: string;
    periodName: string;
    netSalary: number;
    payslipId?: string;
  }) {
    const formattedNet = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(options.netSalary);

    return this.createNotification({
      userId: options.userId,
      type: 'payroll',
      title: `Phiếu lương ${options.periodName} đã sẵn sàng`,
      message: `Bảng lương ${options.periodName} đã được phê duyệt và hoàn tất. Lương thực nhận (Net): ${formattedNet}. Bạn có thể vào hệ thống để xem chi tiết và tải phiếu lương PDF.`,
      actionUrl: `/my-payslips`,
      sendEmail: Boolean(options.employeeEmail),
      emailRecipient: options.employeeEmail,
      recipientName: options.employeeName,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 7. SYSTEM EVENT NOTIFICATION (Single or Broadcast)
  // ────────────────────────────────────────────────────────────────────────────
  static async notifySystemEvent(options: {
    userIds: string[] | 'all';
    title: string;
    message: string;
    actionUrl?: string;
  }) {
    let targetUserIds: string[] = [];

    if (options.userIds === 'all') {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      targetUserIds = users.map((u) => u.id);
    } else {
      targetUserIds = options.userIds;
    }

    if (targetUserIds.length === 0) return 0;

    const notificationsData = targetUserIds.map((userId) => ({
      userId,
      title: options.title,
      message: options.message,
      type: 'system_event',
      actionUrl: options.actionUrl || null,
      isRead: false,
    }));

    const result = await prisma.notification.createMany({
      data: notificationsData,
    });

    logger.info(`[NotificationService] Broadcasted system event to ${result.count} users`);
    return result.count;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // READ / UNREAD & MANAGEMENT QUERIES
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Retrieves paginated notifications for a user with filters
   */
  static async getUserNotifications(
    userId: string,
    options: NotificationQueryOptions = {}
  ): Promise<NotificationListResult> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const skip = (page - 1) * limit;

    const whereClause: any = { userId };

    if (options.isRead !== undefined) {
      whereClause.isRead = options.isRead;
    }

    if (options.type) {
      whereClause.type = options.type;
    }

    if (options.search) {
      whereClause.OR = [
        { title: { contains: options.search, mode: 'insensitive' } },
        { message: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [total, unreadCount, items] = await Promise.all([
      prisma.notification.count({ where: whereClause }),
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.notification.findMany({
        where: whereClause,
        orderBy: options.sortBy
          ? { [options.sortBy]: options.sortOrder || 'desc' }
          : { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      items,
      meta: {
        total,
        unreadCount,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get unread notification count for badge
   */
  static async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Mark notification(s) as read
   * If notificationId is provided, marks that specific one. Otherwise marks all for user.
   */
  static async markAsRead(userId: string, notificationId?: string): Promise<number> {
    if (notificationId) {
      const result = await prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data: { isRead: true },
      });
      return result.count;
    }

    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  }

  /**
   * Mark a notification as unread
   */
  static async markAsUnread(userId: string, notificationId: string): Promise<boolean> {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: false },
    });
    return result.count > 0;
  }

  /**
   * Delete / dismiss a notification
   */
  static async deleteNotification(userId: string, notificationId: string): Promise<boolean> {
    const result = await prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
    return result.count > 0;
  }
}
