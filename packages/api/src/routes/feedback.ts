import { Hono } from 'hono';
import { z } from 'zod';
import { query } from '@alpaca/db';
import { Errors } from '../lib/errors.js';
import type { AppEnv } from '../lib/hono-types.js';

export const feedbackRouter = new Hono<AppEnv>();

const feedbackSchema = z.object({
  message: z.string().min(1).max(2000),
  email: z.string().email().optional(),
  pageUrl: z.string().max(500).optional(),
  userId: z.string().uuid().optional(),
});

// POST /api/v1/feedback (unauthenticated — anyone can submit)
feedbackRouter.post('/', async (c) => {
  const body = feedbackSchema.parse(await c.req.json());

  await query(
    `INSERT INTO feedback (user_id, email, message, page_url)
     VALUES ($1, $2, $3, $4)`,
    [body.userId ?? null, body.email ?? null, body.message, body.pageUrl ?? null],
  );

  return c.json({ message: 'Feedback received' }, 201);
});
