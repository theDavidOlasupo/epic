import { Hono } from 'hono';
import { z } from 'zod';
import { query, withTransaction } from '@alpaca/db';
import { Errors } from '../lib/errors.js';
import { getStripe } from '../lib/stripe.js';
import type { AppEnv } from '../lib/hono-types.js';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

export const guestBookingsRouter = new Hono<AppEnv>();

const guestBookingSchema = z.object({
  spotId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  email: z.string().email(),
  phone: z.string().min(7),
  licencePlate: z.string().min(1),
  licencePlateRegion: z.string().min(1),
});

// POST /api/v1/bookings/guest  (unauthenticated)
guestBookingsRouter.post('/', async (c) => {
  const body = guestBookingSchema.parse(await c.req.json());

  if (new Date(body.endTime) <= new Date(body.startTime)) {
    throw Errors.unprocessable('INVALID_TIME_RANGE', 'endTime must be after startTime');
  }

  // Fetch spot
  const spotResult = await query<{ id: string; price_per_hour: number; status: string; host_id: string }>(
    `SELECT id, price_per_hour, status, host_id FROM parking_spots WHERE id = $1`,
    [body.spotId],
  );
  const spot = spotResult.rows[0];
  if (!spot || spot.status !== 'active') throw Errors.notFound('ParkingSpot');

  const durationMs = new Date(body.endTime).getTime() - new Date(body.startTime).getTime();
  const durationHours = durationMs / (1000 * 60 * 60);
  const totalPrice = Math.ceil(spot.price_per_hour * durationHours);

  const guestToken = randomUUID();

  const result = await withTransaction(async (client: PoolClient) => {
    // Check for overlapping confirmed bookings
    const conflict = await client.query(
      `SELECT id FROM bookings
       WHERE parking_spot_id = $1 AND status = 'confirmed'
         AND start_time < $3 AND end_time > $2 LIMIT 1`,
      [body.spotId, body.startTime, body.endTime],
    );
    if (conflict.rows[0]) {
      throw Errors.conflict('BOOKING_CONFLICT', 'This time slot is already booked');
    }

    // Check for active checkout lock by another driver
    const lock = await client.query(
      `SELECT id FROM checkout_locks
       WHERE parking_spot_id = $1 AND expires_at > NOW()
         AND start_time < $3 AND end_time > $2 LIMIT 1`,
      [body.spotId, body.startTime, body.endTime],
    );
    if (lock.rows[0]) {
      throw Errors.conflict('SPOT_LOCKED', 'This time slot is currently locked by another driver');
    }

    // Create or find guest user by email
    const existingGuest = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND is_guest = TRUE LIMIT 1`,
      [body.email],
    );

    let guestUserId: string;
    if (existingGuest.rows[0]) {
      guestUserId = existingGuest.rows[0].id;
    } else {
      const guestClerkId = `guest_${randomUUID()}`;
      const newGuest = await client.query<{ id: string }>(
        `INSERT INTO users (clerk_user_id, email, name, phone_number, role, is_guest)
         VALUES ($1, $2, $3, $4, 'driver', TRUE)
         RETURNING id`,
        [guestClerkId, body.email, body.email.split('@')[0] ?? 'Guest', body.phone],
      );
      guestUserId = newGuest.rows[0]!.id;
    }

    // Create vehicle for guest
    const vehicleResult = await client.query<{ id: string }>(
      `INSERT INTO vehicles
         (user_id, make, model, year, size_class, licence_plate, licence_plate_region, is_default)
       VALUES ($1, 'Unknown', 'Unknown', 2020, 'mid_size', $2, $3, TRUE)
       RETURNING id`,
      [guestUserId, body.licencePlate, body.licencePlateRegion],
    );
    const vehicleId = vehicleResult.rows[0]!.id;

    // Create booking
    const bookingResult = await client.query<{ id: string; total_price: number; currency: string }>(
      `INSERT INTO bookings
         (driver_id, parking_spot_id, vehicle_id, start_time, end_time, total_price, currency, guest_token)
       VALUES ($1, $2, $3, $4, $5, $6, 'CAD', $7)
       RETURNING id, total_price, currency`,
      [guestUserId, body.spotId, vehicleId, body.startTime, body.endTime, totalPrice, guestToken],
    );
    const booking = bookingResult.rows[0]!;

    // Create checkout lock
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await client.query(
      `INSERT INTO checkout_locks (parking_spot_id, driver_id, start_time, end_time, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [body.spotId, guestUserId, body.startTime, body.endTime, expiresAt],
    );

    return { bookingId: booking.id, totalPrice: booking.total_price, currency: booking.currency, guestUserId };
  });

  // Create Stripe PaymentIntent
  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: result.totalPrice,
    currency: result.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: {
      bookingId: result.bookingId,
      driverId: result.guestUserId,
      spotId: body.spotId,
      guestToken,
    },
  });

  // Store payment record
  await query(
    `INSERT INTO payments
       (booking_id, driver_id, amount, currency, provider_payment_intent_id, status)
     VALUES ($1, $2, $3, $4, $5, 'requires_payment')`,
    [result.bookingId, result.guestUserId, result.totalPrice, result.currency, paymentIntent.id],
  );
  await query(
    `UPDATE bookings SET stripe_payment_intent_id = $1 WHERE id = $2`,
    [paymentIntent.id, result.bookingId],
  );

  return c.json({
    bookingId: result.bookingId,
    guestToken,
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    totalPrice: result.totalPrice,
    currency: result.currency,
  }, 201);
});

// GET /api/v1/bookings/guest/:token  (unauthenticated)
guestBookingsRouter.get('/:token', async (c) => {
  const { token } = c.req.param();

  const result = await query<{
    id: string;
    status: string;
    start_time: string;
    end_time: string;
    total_price: number;
    currency: string;
    spot_address: string;
    entry_instructions: string;
    cancellation_policy: string;
    spot_title: string;
  }>(
    `SELECT
       b.id, b.status, b.start_time, b.end_time, b.total_price, b.currency,
       ps.address AS spot_address, ps.entry_instructions, ps.cancellation_policy, ps.title AS spot_title
     FROM bookings b
     JOIN parking_spots ps ON ps.id = b.parking_spot_id
     WHERE b.guest_token = $1`,
    [token],
  );

  const booking = result.rows[0];
  if (!booking) throw Errors.notFound('Booking');

  return c.json({
    id: booking.id,
    status: booking.status,
    startTime: booking.start_time,
    endTime: booking.end_time,
    totalPrice: booking.total_price,
    currency: booking.currency,
    spotAddress: booking.spot_address,
    entryInstructions: booking.entry_instructions,
    cancellationPolicy: booking.cancellation_policy,
    spotTitle: booking.spot_title,
  });
});
