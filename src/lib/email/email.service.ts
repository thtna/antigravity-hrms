import { EmailMessage, EmailProvider, EmailSendResult } from './types';
import { MockEmailProvider } from './providers/mock.provider';
import { ConsoleEmailProvider } from './providers/console.provider';
import { SendGridEmailProvider } from './providers/sendgrid.provider';
import { SmtpEmailProvider } from './providers/smtp.provider';
import { logger } from '@/lib/logger';

export class EmailService {
  private static providers: Map<string, EmailProvider> = new Map();
  private static activeProviderName: string = 'mock';
  private static initialized: boolean = false;

  /**
   * Initializes standard providers and picks the active one from environment
   */
  static init(): void {
    if (this.initialized) return;

    // Register built-in providers
    this.registerProvider('mock', new MockEmailProvider());
    this.registerProvider('console', new ConsoleEmailProvider());
    this.registerProvider('sendgrid', new SendGridEmailProvider());
    this.registerProvider('smtp', new SmtpEmailProvider());

    // Resolve active provider from environment variable
    const envProvider = process.env.EMAIL_PROVIDER?.toLowerCase();
    if (envProvider && this.providers.has(envProvider)) {
      this.activeProviderName = envProvider;
    } else if (process.env.NODE_ENV === 'test') {
      this.activeProviderName = 'mock';
    } else {
      this.activeProviderName = 'console';
    }

    this.initialized = true;
    logger.info(`[EmailService] Initialized with active provider: ${this.activeProviderName}`);
  }

  /**
   * Register a custom or dynamic email provider
   */
  static registerProvider(name: string, provider: EmailProvider): void {
    this.providers.set(name.toLowerCase(), provider);
  }

  /**
   * Switch active email provider at runtime
   */
  static setActiveProvider(name: string): void {
    const key = name.toLowerCase();
    if (!this.providers.has(key)) {
      throw new Error(`Email provider '${name}' is not registered. Available: ${this.getAvailableProviders().join(', ')}`);
    }
    this.activeProviderName = key;
    logger.info(`[EmailService] Active provider switched to: ${key}`);
  }

  /**
   * Returns current active email provider
   */
  static getActiveProvider(): EmailProvider {
    this.init();
    const provider = this.providers.get(this.activeProviderName);
    if (!provider) {
      // Fallback to mock
      return this.providers.get('mock')!;
    }
    return provider;
  }

  /**
   * Get specific provider by name (e.g. for testing)
   */
  static getProvider<T extends EmailProvider = EmailProvider>(name: string): T | undefined {
    this.init();
    return this.providers.get(name.toLowerCase()) as T | undefined;
  }

  /**
   * List of all registered provider names
   */
  static getAvailableProviders(): string[] {
    this.init();
    return Array.from(this.providers.keys());
  }

  /**
   * Resilient email delivery with automatic fallback
   * Never throws or crashes the host transaction if an email fails
   */
  static async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    this.init();
    const primaryProvider = this.getActiveProvider();

    try {
      if (primaryProvider.isConfigured()) {
        const result = await primaryProvider.sendEmail(message);
        if (result.success) {
          return result;
        }
        logger.warn(`[EmailService] Primary provider '${primaryProvider.name}' failed: ${result.error}. Trying fallback.`);
      } else {
        logger.warn(`[EmailService] Primary provider '${primaryProvider.name}' is not configured. Falling back to console/mock.`);
      }

      // Fallback to console or mock
      const fallbackProvider = this.providers.get('console') || this.providers.get('mock')!;
      return await fallbackProvider.sendEmail(message);
    } catch (err: any) {
      logger.error(`[EmailService] Unexpected error sending email: ${err?.message}`);
      return {
        success: false,
        provider: primaryProvider.name,
        error: err?.message || 'Email delivery failure',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Renders a responsive Royal Luxury HTML notification email
   */
  static renderNotificationEmail(options: {
    title: string;
    message: string;
    recipientName?: string;
    actionUrl?: string;
    type: string;
    companyName?: string;
  }): string {
    const {
      title,
      message,
      recipientName = 'Thành viên Antigravity',
      actionUrl,
      type,
      companyName = 'ANTIGRAVITY CORP HRMS',
    } = options;

    const fullUrl = actionUrl?.startsWith('http')
      ? actionUrl
      : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${actionUrl || '/notifications'}`;

    const typeLabels: Record<string, { label: string; color: string; bg: string }> = {
      leave_request: { label: 'ĐƠN NGHỈ PHÉP', color: '#60A5FA', bg: '#1E3A8A' },
      leave_approval: { label: 'KẾT QUẢ NGHỈ PHÉP', color: '#34D399', bg: '#064E3B' },
      attendance_issue: { label: 'CHẤM CÔNG', color: '#F87171', bg: '#7F1D1D' },
      bonus: { label: 'KHEN THƯỞNG', color: '#FBBF24', bg: '#78350F' },
      penalty: { label: 'KỶ LUẬT / PHẠT', color: '#EF4444', bg: '#7F1D1D' },
      payroll: { label: 'BẢNG LƯƠNG', color: '#A78BFA', bg: '#4C1D95' },
      system_event: { label: 'HỆ THỐNG', color: '#38BDF8', bg: '#0C4A6E' },
    };

    const typeConfig = typeLabels[type] || { label: 'THÔNG BÁO', color: '#94A3B8', bg: '#334155' };

    return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F3F4F6; }
    .container { max-width: 600px; margin: 40px auto; background: #0B0F19; border: 1px solid #1F2937; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); }
    .header { background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%); padding: 32px 28px; text-align: left; border-bottom: 1px solid #2563EB33; }
    .logo { font-size: 18px; font-weight: 800; letter-spacing: 2px; color: #60A5FA; text-transform: uppercase; margin-bottom: 12px; }
    .badge { display: inline-block; padding: 4px 12px; font-size: 11px; font-weight: 700; letter-spacing: 1px; color: ${typeConfig.color}; background-color: ${typeConfig.bg}; border-radius: 9999px; text-transform: uppercase; margin-bottom: 12px; }
    .title { font-size: 22px; font-weight: 700; color: #FFFFFF; margin: 0; line-height: 1.3; }
    .content { padding: 32px 28px; }
    .greeting { font-size: 15px; color: #9CA3AF; margin-bottom: 16px; }
    .message-box { background-color: #111827; border-left: 4px solid #3B82F6; padding: 18px; border-radius: 8px; margin: 20px 0; color: #E5E7EB; line-height: 1.6; font-size: 15px; }
    .btn-wrapper { text-align: center; margin: 32px 0 16px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #2563EB 0%, #4F46E5 100%); color: #FFFFFF; font-weight: 600; font-size: 14px; text-decoration: none; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4); }
    .footer { background: #030712; padding: 24px 28px; text-align: center; border-top: 1px solid #1F2937; font-size: 12px; color: #6B7280; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">⚡ ${companyName}</div>
      <div class="badge">${typeConfig.label}</div>
      <h1 class="title">${title}</h1>
    </div>
    <div class="content">
      <div class="greeting">Xin chào <strong>${recipientName}</strong>,</div>
      <div class="message-box">
        ${message}
      </div>
      ${
        actionUrl
          ? `
      <div class="btn-wrapper">
        <a href="${fullUrl}" class="btn">Xem Chi Tiết Trên Hệ Thống →</a>
      </div>
      `
          : ''
      }
    </div>
    <div class="footer">
      <p>Email này được tạo tự động từ Hệ thống Quản trị Doanh nghiệp Antigravity HRMS.</p>
      <p>&copy; ${new Date().getFullYear()} ${companyName}. Mọi quyền được bảo lưu.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}
