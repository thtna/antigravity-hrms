import { EmailMessage, EmailProvider, EmailSendResult } from '../types';

/**
 * Mock Email Provider for testing and CI
 * Stores all sent emails in memory for assertions
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';
  private sentEmails: Array<{ message: EmailMessage; result: EmailSendResult }> = [];
  private shouldFailNext: boolean = false;
  private failErrorMessage?: string;

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      const errorResult: EmailSendResult = {
        success: false,
        provider: this.name,
        error: this.failErrorMessage || 'Mock email delivery simulated failure',
        timestamp: new Date(),
      };
      this.sentEmails.push({ message, result: errorResult });
      return errorResult;
    }

    const result: EmailSendResult = {
      success: true,
      messageId: `mock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      provider: this.name,
      timestamp: new Date(),
    };

    this.sentEmails.push({ message, result });
    return result;
  }

  isConfigured(): boolean {
    return true;
  }

  getSentEmails(): Array<{ message: EmailMessage; result: EmailSendResult }> {
    return [...this.sentEmails];
  }

  getLastEmail(): EmailMessage | undefined {
    return this.sentEmails[this.sentEmails.length - 1]?.message;
  }

  clear(): void {
    this.sentEmails = [];
    this.shouldFailNext = false;
    this.failErrorMessage = undefined;
  }

  simulateFailure(errorMessage?: string): void {
    this.shouldFailNext = true;
    this.failErrorMessage = errorMessage;
  }
}
