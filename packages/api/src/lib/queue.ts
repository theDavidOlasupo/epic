import { query } from '@alpaca/db';

/**
 * Queue abstraction — local stub that logs jobs to console.
 * In production this sends messages to Amazon SQS.
 */

export async function enqueueLockExpiry(
  lockId: string,
  bookingId: string,
  expiresAt: Date,
): Promise<void> {
  const delayMs = expiresAt.getTime() - Date.now();

  if (process.env['SQS_STUB'] !== 'false') {
    // Local stub: use setTimeout to simulate the delayed expiry
    console.log(
      `[SQS STUB] Enqueuing lock expiry for lockId=${lockId} bookingId=${bookingId} in ${Math.round(delayMs / 1000)}s`,
    );
    setTimeout(() => {
      void expireLock(lockId, bookingId);
    }, Math.max(delayMs, 0));
    return;
  }

  // TODO: send to real SQS with DelaySeconds
  // const sqs = new SQSClient({});
  // await sqs.send(new SendMessageCommand({ ... }));
}

export async function enqueueEmail(
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (process.env['SQS_STUB'] !== 'false') {
    console.log(`[EMAIL STUB] type=${type}`, payload);
    return;
  }
  // TODO: send to real SQS email-queue
}

async function expireLock(lockId: string, bookingId: string): Promise<void> {
  try {
    await query(`DELETE FROM checkout_locks WHERE id = $1`, [lockId]);
    await query(
      `UPDATE bookings SET status = 'expired', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [bookingId],
    );
    console.log(`[SQS STUB] Lock ${lockId} expired, booking ${bookingId} set to expired`);
  } catch (err) {
    console.error('[SQS STUB] Failed to expire lock', err);
  }
}
