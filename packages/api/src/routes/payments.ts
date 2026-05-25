import { Hono } from 'hono';
import { z } from 'zod';
import type Stripe from 'stripe';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { query, withTransaction } from '@alpaca/db';
import { Errors } from '../lib/errors.js';
import { enqueueEmail } from '../lib/queue.js';
import type { AppEnv } from '../lib/hono-types.js';
import type { PoolClient } from 'pg';
import { getStripe } from '../lib/stripe.js';

export const paymentsRouter = new Hono<AppEnv>();

const PLATFORM_FEE_RATE = 0.15;

const createIntentSchema = z.object({
  bookingId: z.string().uuid(),
});

// POST /api/v1/payments/create-intent
paymentsRouter.post('/create-intent', authenticate, requireRole('driver', 'host', 'admin'), async (c) => {
  const auth = c.get('auth');
  const { bookingId } = createIntentSchema.parse(await c.req.json());

  const bookingResult = await query<{
    id: string;
    driver_id: string;
    total_price: number;
    currency: string;
    status: string;
    parking_spot_id: string;
  }>(
    `SELECT id, driver_id, total_price, currency, status, parking_spot_id
     FROM bookings WHERE id = $1`,
    [bookingId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw Errors.notFound('Booking');
  if (booking.driver_id !== auth.userId) throw Errors.forbidden();
  if (booking.status !== 'pending') {
    throw Errors.unprocessable('BOOKING_NOT_PENDING', 'Booking is not in pending status');
  }

  const stripe = getStripe();

  // Create real Stripe PaymentIntent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: booking.total_price,
    currency: booking.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: {
      bookingId: booking.id,
      driverId: booking.driver_id,
      parkingSpotId: booking.parking_spot_id,
    },
  });

  await withTransaction(async (client: PoolClient) => {
    await client.query(
      `INSERT INTO payments
         (booking_id, driver_id, amount, currency, provider_payment_intent_id, status)
       VALUES ($1, $2, $3, $4, $5, 'requires_payment')`,
      [bookingId, auth.userId, booking.total_price, booking.currency, paymentIntent.id],
    );
    await client.query(
      `UPDATE bookings SET stripe_payment_intent_id = $1, updated_at = NOW() WHERE id = $2`,
      [paymentIntent.id, bookingId],
    );
  });

  return c.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
});

// POST /api/v1/payments/webhook  (unauthenticated — verified by Stripe signature)
paymentsRouter.post('/webhook', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('stripe-signature');

  let event: Stripe.Event;

  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
  if (!webhookSecret || webhookSecret === 'whsec_placeholder') {
    // No webhook secret configured — parse directly (dev only)
    console.warn('[webhook] No STRIPE_WEBHOOK_SECRET set — skipping signature verification');
    event = JSON.parse(rawBody) as Stripe.Event;
  } else {
    if (!signature) throw Errors.unauthorized('Missing Stripe signature');
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error('[webhook] Signature verification failed:', err);
      throw Errors.unauthorized('Invalid Stripe signature');
    }
  }

  if (event.type === 'payment_intent.succeeded') {
    await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
  } else if (event.type === 'payment_intent.payment_failed') {
    await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
  }

  return c.json({ received: true });
});

async function handlePaymentSucceeded(pi: Stripe.PaymentIntent) {
  const bookingId = pi.metadata['bookingId'];
  if (!bookingId) {
    console.error('[webhook] payment_intent.succeeded missing bookingId in metadata');
    return;
  }

  await withTransaction(async (client: PoolClient) => {
    const bookingResult = await client.query<{
      id: string;
      driver_id: string;
      total_price: number;
      currency: string;
      parking_spot_id: string;
    }>(
      `UPDATE bookings SET status = 'confirmed', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id, driver_id, total_price, currency, parking_spot_id`,
      [bookingId],
    );
    const booking = bookingResult.rows[0];
    if (!booking) return; // Already processed

    await client.query(
      `UPDATE payments SET status = 'succeeded', updated_at = NOW()
       WHERE provider_payment_intent_id = $1`,
      [pi.id],
    );

    // Delete checkout lock
    await client.query(
      `DELETE FROM checkout_locks
       WHERE parking_spot_id = $1
         AND start_time = (SELECT start_time FROM bookings WHERE id = $2)
         AND end_time   = (SELECT end_time   FROM bookings WHERE id = $2)`,
      [booking.parking_spot_id, bookingId],
    );

    const spotResult = await client.query<{ host_id: string }>(
      `SELECT host_id FROM parking_spots WHERE id = $1`,
      [booking.parking_spot_id],
    );
    const hostId = spotResult.rows[0]?.host_id;

    if (hostId) {
      const platformFeeAmount = Math.round(booking.total_price * PLATFORM_FEE_RATE);
      const hostEarnings = booking.total_price - platformFeeAmount;
      await client.query(
        `INSERT INTO host_payout_records
           (booking_id, host_id, gross_amount, platform_fee_amount, host_earnings, currency)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [bookingId, hostId, booking.total_price, platformFeeAmount, hostEarnings, booking.currency],
      );
    }
  });

  await enqueueEmail('booking_confirmed_driver', { bookingId });
  await enqueueEmail('booking_confirmed_host', { bookingId });
  await enqueueEmail('payment_receipt', { bookingId });
}

async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  const bookingId = pi.metadata['bookingId'];
  if (!bookingId) return;

  await withTransaction(async (client: PoolClient) => {
    await client.query(
      `UPDATE bookings SET status = 'payment_failed', updated_at = NOW() WHERE id = $1`,
      [bookingId],
    );
    await client.query(
      `UPDATE payments SET status = 'failed', updated_at = NOW()
       WHERE provider_payment_intent_id = $1`,
      [pi.id],
    );
  });
}
