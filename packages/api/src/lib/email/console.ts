import type { EmailProvider, EmailMessage } from './types.js';

/**
 * Console email provider — logs emails to stdout.
 * Used in development when no real provider is configured.
 */
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log('[EMAIL]', {
      to: message.to,
      subject: message.subject,
      text: message.text ?? '(html only)',
    });
  }
}
