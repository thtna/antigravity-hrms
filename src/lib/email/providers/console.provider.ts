import { EmailMessage, EmailProvider, EmailSendResult } from '../types';
import { logger } from '@/lib/logger';

/**
 * Console Email Provider for local development
 * Prints rich email metadata and snippet to the application logger
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    const recipients = Array.isArray(message.to) ? message.to.join(', ') : message.to;

    logger.info(`[ConsoleEmailProvider] Sending Email:
--------------------------------------------------------------------------------
To: ${recipients}
From: ${message.from || process.env.SYSTEM_EMAIL_FROM || 'no-reply@localhost'}
Subject: ${message.subject}
Content: ${(message.text || message.html).slice(0, 200)}...
--------------------------------------------------------------------------------`);

    return {
      success: true,
      messageId: `console-${Date.now()}`,
      provider: this.name,
      timestamp: new Date(),
    };
  }

  isConfigured(): boolean {
    return true;
  }
}
