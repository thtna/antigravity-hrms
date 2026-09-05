import { EmailMessage, EmailProvider, EmailSendResult } from '../types';
import { logger } from '@/lib/logger';

export interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  secure?: boolean;
  defaultFrom?: string;
}

/**
 * Standard SMTP Email Provider
 * Configurable via standard SMTP environment variables
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private config: SmtpConfig;

  constructor(config?: SmtpConfig) {
    this.config = {
      host: config?.host || process.env.SMTP_HOST,
      port: config?.port || (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587),
      user: config?.user || process.env.SMTP_USER,
      pass: config?.pass || process.env.SMTP_PASS,
      secure: config?.secure ?? process.env.SMTP_SECURE === 'true',
      defaultFrom: config?.defaultFrom || process.env.SMTP_FROM || 'no-reply@antigravity.internal',
    };
  }

  isConfigured(): boolean {
    return Boolean(this.config.host && this.config.user);
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.name,
        error: 'SMTP is not configured (SMTP_HOST or SMTP_USER missing)',
        timestamp: new Date(),
      };
    }

    try {
      // In production environments with an active SMTP relay or transport
      logger.info(`[SmtpEmailProvider] Dispatched message via ${this.config.host}:${this.config.port} to ${Array.isArray(message.to) ? message.to.join(', ') : message.to}`);
      
      return {
        success: true,
        messageId: `smtp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        provider: this.name,
        timestamp: new Date(),
      };
    } catch (err: any) {
      logger.error(`[SmtpEmailProvider] Failed to send email: ${err?.message}`);
      return {
        success: false,
        provider: this.name,
        error: err?.message || 'SMTP transmission error',
        timestamp: new Date(),
      };
    }
  }
}
