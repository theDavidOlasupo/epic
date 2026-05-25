import { Hono } from 'hono';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { query } from '@alpaca/db';
import { Errors } from '../lib/errors.js';
import type { ParkingSpot, Booking, User } from '@alpaca/types';
import { enqueueEmail } from '../lib/queue.js';
import type { AppEnv } from '../lib/hono-types.js';

export const adminRouter = new Hono<AppEnv>();

const rejectSchema = z.object({ reason: z.string().min(1) });
const updateStatusSchema = z.object({ status: z.enum(['active', 'suspended', 'banned']) });

// ── Listings ───────────────────────────────────────────────────────────────

// GET /api/v1/admin/listings — all listings with optional status filter
adminRouter.get('/listings', authenticate, requireRole('admin'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
  const offset = (page - 1) * limit;
  const status = c.req.query('status') ?? null;

  const result = await query<ParkingSpot>(
    `SELECT id, host_id as "hostId", title, address, latitude, longitude, type,
            price_per_hour as "pricePerHour", photos, rules,
            entry_instructions as "entryInstructions",
            max_vehicle_size as "maxVehicleSize",
            height_restriction_cm as "heightRestrictionCm",
            is_covered as "isCovered", allow_overnight as "allowOvernight",
            cancellation_policy as "cancellationPolicy", status,
            rejection_reason as "rejectionReason",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM parking_spots
     WHERE ($3::text IS NULL OR status = $3)
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, status],
  );
  return c.json({ listings: result.rows, page, limit });
});

adminRouter.get('/listings/pending', authenticate, requireRole('admin'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);
  const offset = (page - 1) * limit;

  const result = await query<ParkingSpot>(
    `SELECT id, host_id as "hostId", title, address, latitude, longitude, type,
            price_per_hour as "pricePerHour", photos, rules,
            entry_instructions as "entryInstructions",
            max_vehicle_size as "maxVehicleSize",
            height_restriction_cm as "heightRestrictionCm",
            is_covered as "isCovered", allow_overnight as "allowOvernight",
            cancellation_policy as "cancellationPolicy", status,
            created_at as "createdAt", updated_at as "updatedAt"
     FROM parking_spots
     WHERE status = 'pending_review'
     ORDER BY created_at ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return c.json({ listings: result.rows, page, limit });
});

adminRouter.post('/listings/:id/approve', authenticate, requireRole('admin'), async (c) => {
  const { id } = c.req.param();
  const result = await query<{ id: string; host_id: string; status: string }>(
    `UPDATE parking_spots SET status = 'active', updated_at = NOW()
     WHERE id = $1 AND status = 'pending_review'
     RETURNING id, host_id, status`,
    [id],
  );
  const spot = result.rows[0];
  if (!spot) throw Errors.notFound('ParkingSpot');
  await enqueueEmail('listing_approved', { spotId: id, hostId: spot.host_id });
  return c.json({ id: spot.id, status: spot.status });
});

adminRouter.post('/listings/:id/reject', authenticate, requireRole('admin'), async (c) => {
  const { id } = c.req.param();
  const { reason } = rejectSchema.parse(await c.req.json());

  const result = await query<{ id: string; host_id: string; status: string }>(
    `UPDATE parking_spots
     SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'pending_review'
     RETURNING id, host_id, status`,
    [reason, id],
  );
  const spot = result.rows[0];
  if (!spot) throw Errors.notFound('ParkingSpot');
  await enqueueEmail('listing_rejected', { spotId: id, hostId: spot.host_id, reason });
  return c.json({ id: spot.id, status: spot.status });
});

adminRouter.post('/listings/:id/pause', authenticate, requireRole('admin'), async (c) => {
  const { id } = c.req.param();
  const result = await query<{ id: string; status: string }>(
    `UPDATE parking_spots SET status = 'paused', updated_at = NOW()
     WHERE id = $1 AND status = 'active'
     RETURNING id, status`,
    [id],
  );
  const spot = result.rows[0];
  if (!spot) throw Errors.notFound('ParkingSpot');
  return c.json({ id: spot.id, status: spot.status });
});

// ── Bookings ───────────────────────────────────────────────────────────────

adminRouter.get('/bookings', authenticate, requireRole('admin'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);
  const offset = (page - 1) * limit;
  const status = c.req.query('status');
  const driverId = c.req.query('driverId');
  const spotId = c.req.query('spotId');

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (status) { conditions.push(`b.status = $${idx++}`); params.push(status); }
  if (driverId) { conditions.push(`b.driver_id = $${idx++}`); params.push(driverId); }
  if (spotId) { conditions.push(`b.parking_spot_id = $${idx++}`); params.push(spotId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

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
     ${where}
     ORDER BY b.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );
  return c.json({ bookings: result.rows, page, limit });
});

// ── Users ──────────────────────────────────────────────────────────────────

adminRouter.get('/users', authenticate, requireRole('admin'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);
  const offset = (page - 1) * limit;
  const role = c.req.query('role');
  const status = c.req.query('status');

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (role) { conditions.push(`role = $${idx++}`); params.push(role); }
  if (status) { conditions.push(`status = $${idx++}`); params.push(status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await query<User>(
    `SELECT id, email, name, phone_number as "phoneNumber", role, status,
            email_verified as "emailVerified", phone_verified as "phoneVerified",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM users ${where}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params,
  );
  return c.json({ users: result.rows, page, limit });
});

adminRouter.put('/users/:id/status', authenticate, requireRole('admin'), async (c) => {
  const { id } = c.req.param();
  const { status } = updateStatusSchema.parse(await c.req.json());

  const result = await query<User>(
    `UPDATE users SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, name, phone_number as "phoneNumber", role, status,
               email_verified as "emailVerified", phone_verified as "phoneVerified",
               created_at as "createdAt", updated_at as "updatedAt"`,
    [status, id],
  );
  const user = result.rows[0];
  if (!user) throw Errors.notFound('User');
  return c.json(user);
});
