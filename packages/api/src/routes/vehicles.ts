import { Hono } from 'hono';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { query, withTransaction } from '@alpaca/db';
import { Errors } from '../lib/errors.js';
import type { Vehicle } from '@alpaca/types';
import type { AppEnv } from '../lib/hono-types.js';
import type { PoolClient } from 'pg';

export const vehiclesRouter = new Hono<AppEnv>();

const vehicleSizeClasses = [
  'compact', 'mid_size', 'full_size', 'suv', 'truck', 'van', 'motorcycle',
] as const;

const createVehicleSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  sizeClass: z.enum(vehicleSizeClasses),
  licencePlate: z.string().min(1),
  licencePlateRegion: z.string().min(1),
  isDefault: z.boolean().optional().default(false),
});

// GET /api/v1/users/me/vehicles
vehiclesRouter.get('/', authenticate, requireRole('driver', 'admin'), async (c) => {
  const auth = c.get('auth');
  const result = await query<Vehicle>(
    `SELECT id, user_id as "userId", make, model, year,
            size_class as "sizeClass", licence_plate as "licencePlate",
            licence_plate_region as "licencePlateRegion", is_default as "isDefault",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM vehicles WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC`,
    [auth.userId],
  );
  return c.json(result.rows);
});

// POST /api/v1/users/me/vehicles
vehiclesRouter.post('/', authenticate, requireRole('driver', 'admin'), async (c) => {
  const auth = c.get('auth');
  const body = createVehicleSchema.parse(await c.req.json());

  const vehicle = await withTransaction(async (client: PoolClient) => {
    if (body.isDefault) {
      await client.query(
        `UPDATE vehicles SET is_default = FALSE, updated_at = NOW() WHERE user_id = $1`,
        [auth.userId],
      );
    }

    const result = await client.query<Vehicle>(
      `INSERT INTO vehicles
         (user_id, make, model, year, size_class, licence_plate, licence_plate_region, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id as "userId", make, model, year,
                 size_class as "sizeClass", licence_plate as "licencePlate",
                 licence_plate_region as "licencePlateRegion", is_default as "isDefault",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        auth.userId,
        body.make,
        body.model,
        body.year,
        body.sizeClass,
        body.licencePlate,
        body.licencePlateRegion,
        body.isDefault,
      ],
    );
    return result.rows[0];
  });

  return c.json(vehicle, 201);
});

// DELETE /api/v1/users/me/vehicles/:vehicleId
vehiclesRouter.delete('/:vehicleId', authenticate, requireRole('driver', 'admin'), async (c) => {
  const auth = c.get('auth');
  const { vehicleId } = c.req.param();

  const vehicleResult = await query(
    `SELECT id FROM vehicles WHERE id = $1 AND user_id = $2`,
    [vehicleId, auth.userId],
  );
  if (!vehicleResult.rows[0]) throw Errors.notFound('Vehicle');

  const inUse = await query(
    `SELECT id FROM bookings
     WHERE vehicle_id = $1 AND status = 'confirmed' AND end_time > NOW()
     LIMIT 1`,
    [vehicleId],
  );
  if (inUse.rows[0]) {
    throw Errors.unprocessable('VEHICLE_IN_USE', 'Vehicle is associated with an upcoming booking');
  }

  await query(`DELETE FROM vehicles WHERE id = $1`, [vehicleId]);
  return c.json({ message: 'Vehicle removed' });
});
