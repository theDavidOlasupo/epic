import type { EmailProvider, EmailPayload } from './types.js';
import { buildEmailMessage } from './templates.js';
import { ConsoleEmailProvider } from './console.js';
import { ResendEmailProvider } from './resend.js';
import { SesEmailProvider } from './ses.js';

let _provider: EmailProvider | null = null;

function getProvider(): EmailProvider {
  if (_provider) return _provider;

  const providerName = process.env['EMAIL_PROVIDER'] ?? 'console';

  switch (providerName) {
    case 'resend':
      _provider = new ResendEmailProvider();
      break;
    case 'ses':
      _provider = new SesEmailProvider();
      break;
    default:
      _provider = new ConsoleEmailProvider();
  }

  console.log(`[email] Using provider: ${providerName}`);
  return _provider;
}

/**
 * Send a typed email notification.
 * Switch providers via EMAIL_PROVIDER env var:
 *   "resend"  → Resend (current)
 *   "ses"     → AWS SES (future)
 *   "console" → logs to stdout (default/dev)
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  try {
    const provider = getProvider();
    const message = buildEmailMessage(payload);
    await provider.send(message);
  } catch (err) {
    // Never let email failures crash the main flow
    console.error('[email] Failed to send:', (err as Error).message);
  }
}

export type { EmailPayload } from './types.js';
