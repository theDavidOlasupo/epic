import { Hono } from 'hono';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { query, withTransaction } from '@alpaca/db';
import { Errors } from '../lib/errors.js';
import type { Booking } from '@alpaca/types';
import { enqueueLockExpiry } from '../lib/queue.js';
import type { AppEnv } from '../lib/hono-types.js';
import type { PoolClient } from 'pg';

export const bookingsRouter = new Hono<AppEnv>();

const createBookingSchema = z.object({
  parkingSpotId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

const cancelBookingSchema = z.object({
  reason: z.string().optional(),
});

// POST /api/v1/bookings
bookingsRouter.post('/', authenticate, requireRole('driver', 'admin'), async (c) => {
  const auth = c.get('auth');
  const body = createBookingSchema.parse(await c.req.json());

  if (new Date(body.endTime) <= new Date(body.startTime)) {
    throw Errors.unprocessable('INVALID_TIME_RANGE', 'endTime must be after startTime');
  }

  const vehicleCheck = await query(
    `SELECT id FROM vehicles WHERE user_id = $1 LIMIT 1`,
    [auth.userId],
  );
  if (!vehicleCheck.rows[0]) {
    throw Errors.unprocessable('VEHICLE_REQUIRED', 'You must add a vehicle before booking');
  }

  const vehicleOwner = await query(
    `SELECT id FROM vehicles WHERE id = $1 AND user_id = $2`,
    [body.vehicleId, auth.userId],
  );
  if (!vehicleOwner.rows[0]) {
    throw Errors.unprocessable('VEHICLE_REQUIRED', 'Vehicle not found or does not belong to you');
  }

  const spotResult = await query<{ price_per_hour: number; status: string }>(
    `SELECT price_per_hour, status FROM parking_spots WHERE id = $1`,
    [body.parkingSpotId],
  );
  const spot = spotResult.rows[0];
  if (!spot || spot.status !== 'active') throw Errors.notFound('ParkingSpot');

  const durationMs = new Date(body.endTime).getTime() - new Date(body.startTime).getTime();
  const durationHours = durationMs / (1000 * 60 * 60);
  const totalPrice = Math.ceil(spot.price_per_hour * durationHours);

  const booking = await withTransaction(async (client: PoolClient) => {
    // Check for active checkout lock held by another driver
    const lock = await client.query(
      `SELECT driver_id FROM checkout_locks
       WHERE parking_spot_id = $1
         AND expires_at > NOW()
         AND start_time < $3
         AND end_time > $2
       LIMIT 1`,
      [body.parkingSpotId, body.startTime, body.endTime],
    );
    if (lock.rows[0] && lock.rows[0].driver_id !== auth.userId) {
      throw Errors.conflict('SPOT_LOCKED', 'This time slot is currently locked by another driver');
    }

    // Check for overlapping confirmed bookings
    const conflict = await client.query(
      `SELECT id FROM bookings
       WHERE parking_spot_id = $1 AND status = 'confirmed'
         AND start_time < $3 AND end_time > $2
       LIMIT 1`,
      [body.parkingSpotId, body.startTime, body.endTime],
    );
    if (conflict.rows[0]) {
      throw Errors.conflict('BOOKING_CONFLICT', 'This time slot is already booked');
    }

    const result = await client.query<Booking>(
      `INSERT INTO bookings
         (driver_id, parking_spot_id, vehicle_id, start_time, end_time, total_price, currency)
       VALUES ($1, $2, $3, $4, $5, $6, 'CAD')
       RETURNING id, driver_id as "driverId", parking_spot_id as "parkingSpotId",
                 vehicle_id as "vehicleId", start_time as "startTime", end_time as "endTime",
                 total_price as "totalPrice", currency, status,
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [auth.userId, body.parkingSpotId, body.vehicleId, body.startTime, body.endTime, totalPrice],
    );
    return result.rows[0];
  });

  return c.json(booking, 201);
});

// GET /api/v1/bookings/me  (driver's own bookings) — MUST be before /:id
bookingsRouter.get('/me', authenticate, requireRole('driver', 'admin'), async (c) => {
  const auth = c.get('auth');
  const filter = c.req.query('filter');

  let timeFilter = '';
  if (filter === 'upcoming') timeFilter = `AND b.end_time > NOW()`;
  else if (filter === 'past') timeFilter = `AND b.end_time <= NOW()`;

  const result = await query<Booking>(
    `SELECT
       b.id, b.driver_id as "driverId", b.parking_spot_id as "parkingSpotId",
       b.vehicle_id as "vehicleId", b.start_time as "startTime", b.end_time as "endTime",
       b.total_price as "totalPrice", b.currency, b.status,
       b.stripe_payment_intent_id as "stripePaymentIntentId",
       b.cancellation_reason as "cancellationReason",
       b.cancelled_at as "cancelledAt",
       b.created_at as "createdAt", b.updated_at as "updatedAt"
     FROM bookings b
     WHERE b.driver_id = $1 ${timeFilter}
     ORDER BY b.start_time DESC`,
    [auth.userId],
  );
  return c.json(result.rows);
});

// GET /api/v1/bookings/:id
bookingsRouter.get('/:id', authenticate, async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();

  const result = await query<
    Booking & {
      spotAddress: string;
      entryInstructions: string;
      spotRules: string[];
      cancellationPolicy: string;
    }
  >(
    `SELECT
       b.id, b.driver_id as "driverId", b.parking_spot_id as "parkingSpotId",
       b.vehicle_id as "vehicleId", b.start_time as "startTime", b.end_time as "endTime",
       b.total_price as "totalPrice", b.currency, b.status,
       b.stripe_payment_intent_id as "stripePaymentIntentId",
       b.cancellation_reason as "cancellationReason",
       b.cancelled_at as "cancelledAt",
       b.created_at as "createdAt", b.updated_at as "updatedAt",
       ps.address as "spotAddress",
       ps.entry_instructions as "entryInstructions",
       ps.rules as "spotRules",
       ps.cancellation_policy as "cancellationPolicy"
     FROM bookings b
     JOIN parking_spots ps ON ps.id = b.parking_spot_id
     WHERE b.id = $1`,
    [id],
  );

  const booking = result.rows[0];
  if (!booking) throw Errors.notFound('Booking');

  if (auth.role !== 'admin' && booking.driverId !== auth.userId) {
    throw Errors.forbidden();
  }

  return c.json(booking);
});

// POST /api/v1/bookings/:id/checkout-lock
bookingsRouter.post('/:id/checkout-lock', authenticate, requireRole('driver', 'admin'), async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();

  const bookingResult = await query<{
    id: string;
    driver_id: string;
    parking_spot_id: string;
    start_time: string;
    end_time: string;
    status: string;
  }>(
    `SELECT id, driver_id, parking_spot_id, start_time, end_time, status
     FROM bookings WHERE id = $1`,
    [id],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw Errors.notFound('Booking');
  if (booking.driver_id !== auth.userId) throw Errors.forbidden();
  if (booking.status !== 'pending') {
    throw Errors.unprocessable('BOOKING_NOT_PENDING', 'Booking is not in pending status');
  }

  // Check driver has < 3 active locks
  const activeLocks = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM checkout_locks
     WHERE driver_id = $1 AND expires_at > NOW()`,
    [auth.userId],
  );
  if (Number(activeLocks.rows[0]?.count ?? 0) >= 3) {
    throw Errors.unprocessable('TOO_MANY_ACTIVE_LOCKS', 'You have too many active checkout locks');
  }

  // Check for overlapping active lock on this spot
  const overlapping = await query(
    `SELECT id FROM checkout_locks
     WHERE parking_spot_id = $1
       AND expires_at > NOW()
       AND start_time < $3
       AND end_time > $2
     LIMIT 1`,
    [booking.parking_spot_id, booking.start_time, booking.end_time],
  );
  if (overlapping.rows[0]) {
    throw Errors.conflict('SPOT_LOCKED', 'This time slot is currently locked by another driver');
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const result = await query<{
    id: string;
    parkingSpotId: string;
    driverId: string;
    startTime: string;
    endTime: string;
    expiresAt: string;
    createdAt: string;
  }>(
    `INSERT INTO checkout_locks
       (parking_spot_id, driver_id, start_time, end_time, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, parking_spot_id as "parkingSpotId", driver_id as "driverId",
               start_time as "startTime", end_time as "endTime",
               expires_at as "expiresAt", created_at as "createdAt"`,
    [booking.parking_spot_id, auth.userId, booking.start_time, booking.end_time, expiresAt],
  );

  const lock = result.rows[0];
  if (!lock) throw Errors.unprocessable('LOCK_FAILED', 'Failed to create checkout lock');

  await enqueueLockExpiry(lock.id, booking.id, expiresAt);

  return c.json(lock, 201);
});

// POST /api/v1/bookings/:id/cancel
bookingsRouter.post('/:id/cancel', authenticate, async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const { reason } = cancelBookingSchema.parse(await c.req.json().catch(() => ({})));

  const bookingResult = await query<{
    id: string;
    driver_id: string;
    start_time: string;
    status: string;
    stripe_payment_intent_id: string | null;
  }>(
    `SELECT id, driver_id, start_time, status, stripe_payment_intent_id
     FROM bookings WHERE id = $1`,
    [id],
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw Errors.notFound('Booking');

  if (auth.role !== 'admin' && booking.driver_id !== auth.userId) throw Errors.forbidden();

  const nonCancellable = ['expired', 'payment_failed', 'cancelled'];
  if (nonCancellable.includes(booking.status)) {
    throw Errors.unprocessable('BOOKING_NOT_CANCELLABLE', 'This booking cannot be cancelled');
  }

  const now = new Date();
  const startTime = new Date(booking.start_time);
  const oneHourBefore = new Date(startTime.getTime() - 60 * 60 * 1000);
  const isEligibleForRefund = now < oneHourBefore;

  await withTransaction(async (client: PoolClient) => {
    if (isEligibleForRefund && booking.stripe_payment_intent_id) {
      console.log(`[STRIPE STUB] Refunding payment intent: ${booking.stripe_payment_intent_id}`);
      await client.query(
        `UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE booking_id = $1`,
        [id],
      );
      await client.query(
        `UPDATE host_payout_records SET status = 'cancelled', updated_at = NOW()
         WHERE booking_id = $1`,
        [id],
      );
    }

    await client.query(
      `UPDATE bookings
       SET status = 'cancelled',
           cancellation_reason = $1,
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [reason ?? null, id],
    );
  });

  console.log(`[EMAIL STUB] Cancellation emails for booking ${id}, refund: ${isEligibleForRefund}`);

  const updated = await query<Booking>(
    `SELECT id, driver_id as "driverId", parking_spot_id as "parkingSpotId",
            vehicle_id as "vehicleId", start_time as "startTime", end_time as "endTime",
            total_price as "totalPrice", currency, status,
            cancellation_reason as "cancellationReason",
            cancelled_at as "cancelledAt",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM bookings WHERE id = $1`,
    [id],
  );
  return c.json(updated.rows[0]);
});
