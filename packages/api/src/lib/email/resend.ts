import { Resend } from 'resend';
import type { EmailProvider, EmailMessage } from './types.js';

/**
 * Resend email provider.
 * Activate: set EMAIL_PROVIDER=resend and RESEND_API_KEY in .env
 */
export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;
  private readonly fromAddress: string;

  constructor() {
    const apiKey = process.env['RESEND_API_KEY'];
    if (!apiKey) throw new Error('RESEND_API_KEY is not set');
    this.client = new Resend(apiKey);
    this.fromAddress = process.env['EMAIL_FROM'] ?? 'Alpaca Parking <noreply@alpacaparking.com>';
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.fromAddress,
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.text ? { text: message.text } : {}),
    });

    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }
  }
}
