import { Hono } from 'hono';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { query } from '@alpaca/db';
import { Errors } from '../lib/errors.js';
import type { ParkingSpot, ParkingSearchResult } from '@alpaca/types';
import type { AppEnv } from '../lib/hono-types.js';

export const parkingSpotsRouter = new Hono<AppEnv>();

const spotTypes = ['driveway', 'garage', 'lot', 'underground', 'other'] as const;
const vehicleSizes = ['compact', 'mid_size', 'full_size', 'suv', 'truck', 'van'] as const;

const createSpotSchema = z.object({
  title: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  type: z.enum(spotTypes),
  pricePerHour: z.number().int().positive(),
  entryInstructions: z.string().default(''),
  isCovered: z.boolean(),
  allowOvernight: z.boolean(),
  maxVehicleSize: z.enum(vehicleSizes).optional(),
  heightRestrictionCm: z.number().int().positive().optional(),
  rules: z.array(z.string()).optional().default([]),
});

const availabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1),
});

const availabilityBlockSchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  reason: z.string().optional(),
});

// ── Search ─────────────────────────────────────────────────────────────────

// GET /api/v1/parking-spots/mine  (host's own listings)
parkingSpotsRouter.get('/mine', authenticate, requireRole('host', 'admin'), async (c) => {
  const auth = c.get('auth');
  const result = await query<ParkingSpot>(
    `SELECT id, host_id AS "hostId", title, address, latitude, longitude, type,
            price_per_hour AS "pricePerHour", photos, rules,
            entry_instructions AS "entryInstructions",
            max_vehicle_size AS "maxVehicleSize",
            height_restriction_cm AS "heightRestrictionCm",
            is_covered AS "isCovered", allow_overnight AS "allowOvernight",
            cancellation_policy AS "cancellationPolicy", status,
            rejection_reason AS "rejectionReason",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM parking_spots
     WHERE host_id = $1
     ORDER BY created_at DESC`,
    [auth.userId],
  );
  return c.json(result.rows);
});

// GET /api/v1/parking-spots/search
parkingSpotsRouter.get('/search', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lng = Number(c.req.query('lng'));
  const radiusKm = Number(c.req.query('radiusKm') ?? 5);
  const startTime = c.req.query('startTime');
  const endTime = c.req.query('endTime');
  const maxPrice = c.req.query('maxPricePerHour') ? Number(c.req.query('maxPricePerHour')) : null;
  const type = c.req.query('type') ?? null;

  if (!startTime || !endTime) {
    throw Errors.unprocessable('INVALID_TIME_RANGE', 'startTime and endTime are required');
  }
  if (new Date(endTime) <= new Date(startTime)) {
    throw Errors.unprocessable('INVALID_TIME_RANGE', 'endTime must be after startTime');
  }
  if (radiusKm > 50) {
    throw Errors.unprocessable('RADIUS_TOO_LARGE', 'Radius cannot exceed 50 km');
  }

  const radiusMeters = radiusKm * 1000;

  const result = await query<ParkingSearchResult & { primary_photo_key: string | null }>(
    `SELECT
       ps.id,
       ps.title,
       ps.address,
       ps.latitude,
       ps.longitude,
       ps.type,
       ps.price_per_hour AS "pricePerHour",
       ps.is_covered AS "isCovered",
       TRUE AS "isAvailable",
       ps.photos[1] AS primary_photo_key,
       ST_Distance(
         ps.location::geography,
         ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
       ) AS "distanceMeters"
     FROM parking_spots ps
     WHERE
       ps.status = 'active'
       AND ST_DWithin(
         ps.location::geography,
         ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
         $3
       )
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.parking_spot_id = ps.id
           AND b.status = 'confirmed'
           AND b.start_time < $5
           AND b.end_time > $4
       )
       AND NOT EXISTS (
         SELECT 1 FROM availability_blocks ab
         WHERE ab.parking_spot_id = ps.id
           AND ab.start_time < $5
           AND ab.end_time > $4
       )
       AND ($6::integer IS NULL OR ps.price_per_hour <= $6)
       AND ($7::text IS NULL OR ps.type = $7)
     ORDER BY "distanceMeters" ASC
     LIMIT 50`,
    [lat, lng, radiusMeters, startTime, endTime, maxPrice, type],
  );

  const spots = result.rows.map((row: ParkingSearchResult & { primary_photo_key: string | null }) => ({
    ...row,
    primaryPhotoUrl: row.primary_photo_key ?? null,
    primary_photo_key: undefined,
  }));

  return c.json({ spots, total: spots.length });
});

// ── Spot CRUD ──────────────────────────────────────────────────────────────

// GET /api/v1/parking-spots/:id
parkingSpotsRouter.get('/:id', async (c) => {
  const { id } = c.req.param();
  const result = await query<ParkingSpot & { hostName: string; hostPhoneVerified: boolean }>(
    `SELECT
       ps.id, ps.host_id AS "hostId", ps.title, ps.address,
       ps.latitude, ps.longitude, ps.type,
       ps.price_per_hour AS "pricePerHour",
       ps.photos, ps.rules,
       ps.entry_instructions AS "entryInstructions",
       ps.max_vehicle_size AS "maxVehicleSize",
       ps.height_restriction_cm AS "heightRestrictionCm",
       ps.is_covered AS "isCovered",
       ps.allow_overnight AS "allowOvernight",
       ps.cancellation_policy AS "cancellationPolicy",
       ps.status,
       ps.rejection_reason AS "rejectionReason",
       ps.created_at AS "createdAt",
       ps.updated_at AS "updatedAt",
       u.name AS "hostName",
       u.phone_verified AS "hostPhoneVerified"
     FROM parking_spots ps
     JOIN users u ON u.id = ps.host_id
     WHERE ps.id = $1 AND ps.status = 'active'`,
    [id],
  );
  const spot = result.rows[0];
  if (!spot) throw Errors.notFound('ParkingSpot');
  return c.json(spot);
});

// POST /api/v1/parking-spots
parkingSpotsRouter.post(
  '/',
  authenticate,
  requireRole('host', 'admin'),
  async (c) => {
    const auth = c.get('auth');
    const body = createSpotSchema.parse(await c.req.json());

    const result = await query<ParkingSpot>(
      `INSERT INTO parking_spots
         (host_id, title, address, location, latitude, longitude, type, price_per_hour,
          entry_instructions, is_covered, allow_overnight, max_vehicle_size,
          height_restriction_cm, rules)
       VALUES (
         $1, $2, $3,
         ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography,
         $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
       )
       RETURNING id, host_id AS "hostId", title, address, latitude, longitude, type,
                 price_per_hour AS "pricePerHour", photos, rules,
                 entry_instructions AS "entryInstructions",
                 max_vehicle_size AS "maxVehicleSize",
                 height_restriction_cm AS "heightRestrictionCm",
                 is_covered AS "isCovered", allow_overnight AS "allowOvernight",
                 cancellation_policy AS "cancellationPolicy", status,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        auth.userId,
        body.title,
        body.address,
        body.latitude,
        body.longitude,
        body.type,
        body.pricePerHour,
        body.entryInstructions,
        body.isCovered,
        body.allowOvernight,
        body.maxVehicleSize ?? null,
        body.heightRestrictionCm ?? null,
        body.rules,
      ],
    );
    return c.json(result.rows[0], 201);
  },
);

// PUT /api/v1/parking-spots/:id
parkingSpotsRouter.put(
  '/:id',
  authenticate,
  requireRole('host'),
  async (c) => {
    const auth = c.get('auth');
    const { id } = c.req.param();
    const body = createSpotSchema.partial().parse(await c.req.json());

    const existing = await query<{ status: string; host_id: string }>(
      `SELECT status, host_id FROM parking_spots WHERE id = $1`,
      [id],
    );
    const spot = existing.rows[0];
    if (!spot) throw Errors.notFound('ParkingSpot');
    if (spot.host_id !== auth.userId) throw Errors.forbidden();
    if (!['draft', 'rejected'].includes(spot.status)) {
      throw Errors.unprocessable('LISTING_NOT_EDITABLE', 'Listing cannot be edited in its current status');
    }

    const result = await query<ParkingSpot>(
      `UPDATE parking_spots SET
         title = COALESCE($1, title),
         address = COALESCE($2, address),
         type = COALESCE($3, type),
         price_per_hour = COALESCE($4, price_per_hour),
         entry_instructions = COALESCE($5, entry_instructions),
         is_covered = COALESCE($6, is_covered),
         allow_overnight = COALESCE($7, allow_overnight),
         max_vehicle_size = COALESCE($8, max_vehicle_size),
         height_restriction_cm = COALESCE($9, height_restriction_cm),
         rules = COALESCE($10, rules),
         updated_at = NOW()
       WHERE id = $11
       RETURNING id, host_id AS "hostId", title, address, latitude, longitude, type,
                 price_per_hour AS "pricePerHour", photos, rules,
                 entry_instructions AS "entryInstructions",
                 max_vehicle_size AS "maxVehicleSize",
                 height_restriction_cm AS "heightRestrictionCm",
                 is_covered AS "isCovered", allow_overnight AS "allowOvernight",
                 cancellation_policy AS "cancellationPolicy", status,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        body.title ?? null,
        body.address ?? null,
        body.type ?? null,
        body.pricePerHour ?? null,
        body.entryInstructions ?? null,
        body.isCovered ?? null,
        body.allowOvernight ?? null,
        body.maxVehicleSize ?? null,
        body.heightRestrictionCm ?? null,
        body.rules ?? null,
        id,
      ],
    );
    return c.json(result.rows[0]);
  },
);

// POST /api/v1/parking-spots/:id/submit-review
parkingSpotsRouter.post('/:id/submit-review', authenticate, requireRole('host', 'admin'), async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();

  const existing = await query<{ status: string; host_id: string }>(
    `SELECT status, host_id FROM parking_spots WHERE id = $1`,
    [id],
  );
  const spot = existing.rows[0];
  if (!spot) throw Errors.notFound('ParkingSpot');
  if (spot.host_id !== auth.userId) throw Errors.forbidden();
  if (!['draft', 'rejected'].includes(spot.status)) {
    throw Errors.unprocessable('LISTING_NOT_EDITABLE', 'Listing cannot be submitted in its current status');
  }

  const result = await query<ParkingSpot>(
    `UPDATE parking_spots SET status = 'pending_review', updated_at = NOW()
     WHERE id = $1
     RETURNING id, status, updated_at AS "updatedAt"`,
    [id],
  );
  return c.json(result.rows[0]);
});

// POST /api/v1/parking-spots/:id/pause
parkingSpotsRouter.post('/:id/pause', authenticate, requireRole('host'), async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();

  const existing = await query<{ status: string; host_id: string }>(
    `SELECT status, host_id FROM parking_spots WHERE id = $1`,
    [id],
  );
  const spot = existing.rows[0];
  if (!spot) throw Errors.notFound('ParkingSpot');
  if (spot.host_id !== auth.userId) throw Errors.forbidden();
  if (spot.status !== 'active') {
    throw Errors.unprocessable('LISTING_NOT_EDITABLE', 'Only active listings can be paused');
  }

  const result = await query<ParkingSpot>(
    `UPDATE parking_spots SET status = 'paused', updated_at = NOW()
     WHERE id = $1
     RETURNING id, status, updated_at AS "updatedAt"`,
    [id],
  );
  return c.json(result.rows[0]);
});

// POST /api/v1/parking-spots/:id/photos/upload-url
parkingSpotsRouter.post(
  '/:id/photos/upload-url',
  authenticate,
  requireRole('host'),
  async (c) => {
    const auth = c.get('auth');
    const { id } = c.req.param();
    const { filename, contentType } = await c.req.json<{ filename: string; contentType: string }>();

    const existing = await query<{ host_id: string }>(
      `SELECT host_id FROM parking_spots WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) throw Errors.notFound('ParkingSpot');
    if (existing.rows[0].host_id !== auth.userId) throw Errors.forbidden();

    const key = `spots/${id}/${Date.now()}-${filename}`;

    // TODO: generate real S3 pre-signed URL (stub: return a local placeholder)
    const uploadUrl = `http://localhost:9000/alpaca-photos/${key}?stub=true`;
    console.log(`[S3 STUB] Pre-signed URL for key: ${key}`);

    return c.json({ uploadUrl, key });
  },
);

// POST /api/v1/parking-spots/:id/photos/confirm
parkingSpotsRouter.post(
  '/:id/photos/confirm',
  authenticate,
  requireRole('host'),
  async (c) => {
    const auth = c.get('auth');
    const { id } = c.req.param();
    const { key } = await c.req.json<{ key: string }>();

    const existing = await query<{ host_id: string }>(
      `SELECT host_id FROM parking_spots WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) throw Errors.notFound('ParkingSpot');
    if (existing.rows[0].host_id !== auth.userId) throw Errors.forbidden();

    await query(
      `UPDATE parking_spots SET photos = array_append(photos, $1), updated_at = NOW()
       WHERE id = $2`,
      [key, id],
    );
    return c.json({ message: 'Photo added' });
  },
);

// ── Availability rules ─────────────────────────────────────────────────────

// POST /api/v1/parking-spots/:id/availability-rules
parkingSpotsRouter.post(
  '/:id/availability-rules',
  authenticate,
  requireRole('host'),
  async (c) => {
    const auth = c.get('auth');
    const { id } = c.req.param();
    const body = availabilityRuleSchema.parse(await c.req.json());

    const existing = await query<{ host_id: string }>(
      `SELECT host_id FROM parking_spots WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) throw Errors.notFound('ParkingSpot');
    if (existing.rows[0].host_id !== auth.userId) throw Errors.forbidden();

    const result = await query(
      `INSERT INTO availability_rules (parking_spot_id, day_of_week, start_time, end_time, timezone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, parking_spot_id AS "parkingSpotId", day_of_week AS "dayOfWeek",
                 start_time AS "startTime", end_time AS "endTime", timezone`,
      [id, body.dayOfWeek, body.startTime, body.endTime, body.timezone],
    );
    return c.json(result.rows[0], 201);
  },
);

// DELETE /api/v1/parking-spots/:id/availability-rules/:ruleId
parkingSpotsRouter.delete(
  '/:id/availability-rules/:ruleId',
  authenticate,
  requireRole('host'),
  async (c) => {
    const auth = c.get('auth');
    const { id, ruleId } = c.req.param();

    const existing = await query<{ host_id: string }>(
      `SELECT host_id FROM parking_spots WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) throw Errors.notFound('ParkingSpot');
    if (existing.rows[0].host_id !== auth.userId) throw Errors.forbidden();

    await query(
      `DELETE FROM availability_rules WHERE id = $1 AND parking_spot_id = $2`,
      [ruleId, id],
    );
    return c.json({ message: 'Rule deleted' });
  },
);

// ── Availability blocks ────────────────────────────────────────────────────

// POST /api/v1/parking-spots/:id/availability-blocks
parkingSpotsRouter.post(
  '/:id/availability-blocks',
  authenticate,
  requireRole('host'),
  async (c) => {
    const auth = c.get('auth');
    const { id } = c.req.param();
    const body = availabilityBlockSchema.parse(await c.req.json());

    const existing = await query<{ host_id: string }>(
      `SELECT host_id FROM parking_spots WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) throw Errors.notFound('ParkingSpot');
    if (existing.rows[0].host_id !== auth.userId) throw Errors.forbidden();

    // Check for conflict with confirmed bookings
    const conflict = await query(
      `SELECT id FROM bookings
       WHERE parking_spot_id = $1 AND status = 'confirmed'
         AND start_time < $3 AND end_time > $2
       LIMIT 1`,
      [id, body.startTime, body.endTime],
    );
    if (conflict.rows[0]) {
      throw Errors.unprocessable(
        'BLOCK_CONFLICTS_WITH_BOOKING',
        'Block overlaps an existing confirmed booking',
      );
    }

    const result = await query(
      `INSERT INTO availability_blocks (parking_spot_id, start_time, end_time, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING id, parking_spot_id AS "parkingSpotId",
                 start_time AS "startTime", end_time AS "endTime", reason`,
      [id, body.startTime, body.endTime, body.reason ?? null],
    );
    return c.json(result.rows[0], 201);
  },
);

// DELETE /api/v1/parking-spots/:id/availability-blocks/:blockId
parkingSpotsRouter.delete(
  '/:id/availability-blocks/:blockId',
  authenticate,
  requireRole('host'),
  async (c) => {
    const auth = c.get('auth');
    const { id, blockId } = c.req.param();

    const existing = await query<{ host_id: string }>(
      `SELECT host_id FROM parking_spots WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) throw Errors.notFound('ParkingSpot');
    if (existing.rows[0].host_id !== auth.userId) throw Errors.forbidden();

    await query(
      `DELETE FROM availability_blocks WHERE id = $1 AND parking_spot_id = $2`,
      [blockId, id],
    );
    return c.json({ message: 'Block deleted' });
  },
);
