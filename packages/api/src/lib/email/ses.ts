import type { EmailProvider, EmailMessage } from './types.js';

/**
 * AWS SES email provider.
 * To activate: set EMAIL_PROVIDER=ses in .env and configure AWS credentials.
 *
 * Install when ready:
 *   pnpm --filter @alpaca/api add @aws-sdk/client-ses
 */
export class SesEmailProvider implements EmailProvider {
  private readonly fromAddress: string;

  constructor() {
    this.fromAddress = process.env['SES_FROM_ADDRESS'] ?? 'noreply@alpacaparking.com';
  }

  async send(message: EmailMessage): Promise<void> {
    // TODO: implement when migrating to AWS SES
    // const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
    // const client = new SESClient({ region: process.env['AWS_REGION'] ?? 'ca-central-1' });
    // await client.send(new SendEmailCommand({
    //   Source: this.fromAddress,
    //   Destination: { ToAddresses: [message.to] },
    //   Message: {
    //     Subject: { Data: message.subject },
    //     Body: {
    //       Html: { Data: message.html },
    //       Text: { Data: message.text ?? '' },
    //     },
    //   },
    // }));
    throw new Error('SES provider not yet implemented. Set EMAIL_PROVIDER=resend or EMAIL_PROVIDER=console.');
  }
}
