import { EmailMessage, EmailProvider, EmailSendResult } from '../types';
import { logger } from '@/lib/logger';

export interface SendGridConfig {
  apiKey?: string;
  defaultFrom?: string;
}

/**
 * SendGrid Email Provider via native HTTP fetch
 * Works without requiring the heavy @sendgrid/mail dependency
 */
export class SendGridEmailProvider implements EmailProvider {
  readonly name = 'sendgrid';
  private apiKey: string;
  private defaultFrom: string;

  constructor(config?: SendGridConfig) {
    this.apiKey = config?.apiKey || process.env.SENDGRID_API_KEY || '';
    this.defaultFrom = config?.defaultFrom || process.env.SENDGRID_FROM_EMAIL || 'no-reply@localhost';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.name,
        error: 'SendGrid API key is not configured (SENDGRID_API_KEY missing)',
        timestamp: new Date(),
      };
    }

    try {
      const recipients = Array.isArray(message.to) ? message.to : [message.to];
      const payload = {
        personalizations: [
          {
            to: recipients.map((email) => ({ email })),
            subject: message.subject,
          },
        ],
        from: { email: message.from || this.defaultFrom },
        content: [
          ...(message.text ? [{ type: 'text/plain', value: message.text }] : []),
          { type: 'text/html', value: message.html },
        ],
      };

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error(`[SendGridEmailProvider] Failed with status ${response.status}: ${errText}`);
        return {
          success: false,
          provider: this.name,
          error: `SendGrid API returned status ${response.status}: ${errText}`,
          timestamp: new Date(),
        };
      }

      const messageId = response.headers.get('x-message-id') || `sg-${Date.now()}`;
      return {
        success: true,
        messageId,
        provider: this.name,
        timestamp: new Date(),
      };
    } catch (err: any) {
      logger.error(`[SendGridEmailProvider] Error sending email: ${err?.message}`);
      return {
        success: false,
        provider: this.name,
        error: err?.message || 'SendGrid network error',
        timestamp: new Date(),
      };
    }
  }
}
