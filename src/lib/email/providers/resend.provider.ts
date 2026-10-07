import { EmailMessage, EmailProvider, EmailSendResult } from '../types';
import { logger } from '@/lib/logger';

export interface ResendConfig {
  apiKey?: string;
  defaultFrom?: string;
}

/**
 * Resend Email Provider via native HTTP fetch.
 * Keeps the email transport lightweight for Vercel/serverless runtimes.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  private apiKey: string;
  private defaultFrom: string;

  constructor(config?: ResendConfig) {
    this.apiKey = config?.apiKey || process.env.RESEND_API_KEY || '';
    this.defaultFrom =
      config?.defaultFrom || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0 && this.defaultFrom.trim().length > 0);
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.name,
        error: 'Resend is not configured (RESEND_API_KEY or RESEND_FROM_EMAIL missing)',
        timestamp: new Date(),
      };
    }

    try {
      const recipients = Array.isArray(message.to) ? message.to : [message.to];

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: message.from || this.defaultFrom,
          to: recipients,
          subject: message.subject,
          html: message.html,
          ...(message.text ? { text: message.text } : {}),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error(`[ResendEmailProvider] Failed with status ${response.status}: ${errText}`);
        return {
          success: false,
          provider: this.name,
          error: `Resend API returned status ${response.status}`,
          timestamp: new Date(),
        };
      }

      const payload = (await response.json()) as { id?: string };

      if (!payload.id) {
        logger.error('[ResendEmailProvider] API returned success without an email id');
        return {
          success: false,
          provider: this.name,
          error: 'Resend API returned no email id',
          timestamp: new Date(),
        };
      }

      return {
        success: true,
        messageId: payload.id,
        provider: this.name,
        timestamp: new Date(),
      };
    } catch (err: any) {
      logger.error(`[ResendEmailProvider] Error sending email: ${err?.message}`);
      return {
        success: false,
        provider: this.name,
        error: err?.message || 'Resend network error',
        timestamp: new Date(),
      };
    }
  }
}
