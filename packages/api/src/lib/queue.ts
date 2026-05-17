import { query } from '@alpaca/db';
import { sendEmail } from './email/index.js';
import type { EmailPayload } from './email/types.js';

/**
 * Queue abstraction — local stub that processes jobs in-process.
 * In production this sends messages to Amazon SQS.
 */

export async function enqueueLockExpiry(
  lockId: string,
  bookingId: string,
  expiresAt: Date,
): Promise<void> {
  const delayMs = expiresAt.getTime() - Date.now();

  if (process.env['SQS_STUB'] !== 'false') {
    console.log(
      `[SQS STUB] Enqueuing lock expiry for lockId=${lockId} bookingId=${bookingId} in ${Math.round(delayMs / 1000)}s`,
    );
    setTimeout(() => {
      void expireLock(lockId, bookingId);
    }, Math.max(delayMs, 0));
    return;
  }

  // TODO: send to real SQS with DelaySeconds
}

export async function enqueueEmail(
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    if (type === 'listing_approved' || type === 'listing_rejected') {
      await dispatchListingEmail(type, payload);
    } else {
      await dispatchEmail(type, payload);
    }
  } catch (err) {
    console.error('[email queue] Failed to dispatch email:', type, err);
  }
}

async function dispatchEmail(type: string, payload: Record<string, unknown>): Promise<void> {
  const bookingId = payload['bookingId'] as string | undefined;

  if (!bookingId) {
    console.warn('[email queue] No bookingId in payload for type:', type);
    return;
  }

  // Fetch booking + related data for email templates
  const bookingResult = await query<{
    id: string;
    driver_id: string;
    parking_spot_id: string;
    start_time: string;
    end_time: string;
    total_price: number;
    currency: string;
    stripe_payment_intent_id: string | null;
    spot_address: string;
    entry_instructions: string;
    cancellation_policy: string;
    driver_name: string;
    driver_email: string;
    host_id: string;
    host_name: string;
    host_email: string;
    spot_title: string;
    licence_plate: string;
  }>(
    `SELECT
       b.id, b.driver_id, b.parking_spot_id, b.start_time, b.end_time,
       b.total_price, b.currency, b.stripe_payment_intent_id,
       ps.address AS spot_address, ps.entry_instructions, ps.cancellation_policy,
       ps.title AS spot_title,
       d.name AS driver_name, d.email AS driver_email,
       h.id AS host_id, h.name AS host_name, h.email AS host_email,
       v.licence_plate
     FROM bookings b
     JOIN parking_spots ps ON ps.id = b.parking_spot_id
     JOIN users d ON d.id = b.driver_id
     JOIN users h ON h.id = ps.host_id
     LEFT JOIN vehicles v ON v.id = b.vehicle_id
     WHERE b.id = $1`,
    [bookingId],
  );

  const data = bookingResult.rows[0];
  if (!data) {
    console.warn('[email queue] Booking not found for email:', bookingId);
    return;
  }

  let emailPayload: EmailPayload | null = null;

  switch (type) {
    case 'booking_confirmed_driver':
      emailPayload = {
        type: 'booking_confirmed_driver',
        to: data.driver_email,
        driverName: data.driver_name,
        bookingId: data.id,
        spotAddress: data.spot_address,
        startTime: data.start_time,
        endTime: data.end_time,
        totalPrice: data.total_price,
        currency: data.currency,
        entryInstructions: data.entry_instructions,
        cancellationPolicy: data.cancellation_policy,
      };
      break;

    case 'booking_confirmed_host':
      emailPayload = {
        type: 'booking_confirmed_host',
        to: data.host_email,
        hostName: data.host_name,
        bookingId: data.id,
        spotAddress: data.spot_address,
        startTime: data.start_time,
        endTime: data.end_time,
        driverName: data.driver_name,
        vehicleLicencePlate: data.licence_plate ?? 'N/A',
      };
      break;

    case 'payment_receipt':
      emailPayload = {
        type: 'payment_receipt',
        to: data.driver_email,
        driverName: data.driver_name,
        bookingId: data.id,
        amount: data.total_price,
        currency: data.currency,
        stripePaymentIntentId: data.stripe_payment_intent_id ?? '',
      };
      break;

    case 'booking_cancelled_driver':
      emailPayload = {
        type: 'booking_cancelled_driver',
        to: data.driver_email,
        driverName: data.driver_name,
        bookingId: data.id,
        spotAddress: data.spot_address,
        startTime: data.start_time,
        endTime: data.end_time,
        refunded: (payload['refunded'] as boolean) ?? false,
      };
      break;

    case 'booking_cancelled_host':
      emailPayload = {
        type: 'booking_cancelled_host',
        to: data.host_email,
        hostName: data.host_name,
        bookingId: data.id,
        spotAddress: data.spot_address,
        startTime: data.start_time,
        endTime: data.end_time,
      };
      break;

    default:
      console.warn('[email queue] Unknown email type:', type);
      return;
  }

  if (emailPayload) {
    await sendEmail(emailPayload);
  }
}

async function dispatchListingEmail(type: string, payload: Record<string, unknown>): Promise<void> {
  const spotId = payload['spotId'] as string | undefined;
  const hostId = payload['hostId'] as string | undefined;

  if (!spotId || !hostId) return;

  const result = await query<{ host_name: string; host_email: string; spot_title: string }>(
    `SELECT u.name AS host_name, u.email AS host_email, ps.title AS spot_title
     FROM parking_spots ps JOIN users u ON u.id = ps.host_id
     WHERE ps.id = $1`,
    [spotId],
  );
  const data = result.rows[0];
  if (!data) return;

  if (type === 'listing_approved') {
    await sendEmail({
      type: 'listing_approved',
      to: data.host_email,
      hostName: data.host_name,
      spotTitle: data.spot_title,
    });
  } else if (type === 'listing_rejected') {
    await sendEmail({
      type: 'listing_rejected',
      to: data.host_email,
      hostName: data.host_name,
      spotTitle: data.spot_title,
      reason: (payload['reason'] as string) ?? '',
    });
  }
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
