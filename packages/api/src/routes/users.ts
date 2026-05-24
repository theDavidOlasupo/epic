import { Hono } from 'hono';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { query } from '@alpaca/db';
import { Errors } from '../lib/errors.js';
import type { User } from '@alpaca/types';
import type { AppEnv } from '../lib/hono-types.js';

export const usersRouter = new Hono<AppEnv>();

// GET /api/v1/users/me
usersRouter.get('/me', authenticate, async (c) => {
  const auth = c.get('auth');
  const result = await query<User>(
    `SELECT id, email, name, phone_number as "phoneNumber", role, status,
            email_verified as "emailVerified", phone_verified as "phoneVerified",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM users WHERE id = $1`,
    [auth.userId],
  );
  const user = result.rows[0];
  if (!user) throw Errors.notFound('User');
  return c.json(user);
});

const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  phoneNumber: z.string().min(7).optional(),
});

// PUT /api/v1/users/me
usersRouter.put('/me', authenticate, async (c) => {
  const auth = c.get('auth');
  const { name, phoneNumber } = updateMeSchema.parse(await c.req.json());

  const result = await query<User>(
    `UPDATE users
     SET name = COALESCE($1, name),
         phone_number = COALESCE($2, phone_number),
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, email, name, phone_number as "phoneNumber", role, status,
               email_verified as "emailVerified", phone_verified as "phoneVerified",
               created_at as "createdAt", updated_at as "updatedAt"`,
    [name ?? null, phoneNumber ?? null, auth.userId],
  );
  const user = result.rows[0];
  if (!user) throw Errors.notFound('User');
  return c.json(user);
});

// POST /api/v1/users/me/become-host
usersRouter.post('/me/become-host', authenticate, async (c) => {
  const auth = c.get('auth');

  if (auth.role === 'host' || auth.role === 'admin') {
    return c.json({ message: 'Already a host' });
  }

  const result = await query<User>(
    `UPDATE users SET role = 'host', updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, name, phone_number as "phoneNumber", role, status,
               email_verified as "emailVerified", phone_verified as "phoneVerified",
               created_at as "createdAt", updated_at as "updatedAt"`,
    [auth.userId],
  );
  const user = result.rows[0];
  if (!user) throw Errors.notFound('User');
  return c.json(user);
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'banned']),
});

// PUT /api/v1/users/:id/status  (used by admin router)
usersRouter.put('/:id/status', authenticate, requireRole('admin'), async (c) => {
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
