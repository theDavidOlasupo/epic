import { Hono } from 'hono';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { query } from '@alpaca/db';
import { Errors } from '../lib/errors.js';
import bcrypt from 'bcryptjs';
import type { AppEnv } from '../lib/hono-types.js';

export const authRouter = new Hono<AppEnv>();

const verifyPhoneSchema = z.object({
  phoneNumber: z.string().min(7),
});

const confirmPhoneSchema = z.object({
  phoneNumber: z.string().min(7),
  otp: z.string().length(6),
});

// POST /api/v1/auth/verify-phone
authRouter.post('/verify-phone', authenticate, async (c) => {
  const body = verifyPhoneSchema.parse(await c.req.json());
  const auth = c.get('auth');

  const otp = Math.floor(100_000 + Math.random() * 900_000).toString();
  const codeHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await query(
    `INSERT INTO otp_records (user_id, phone, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [auth.userId, body.phoneNumber, codeHash, expiresAt],
  );

  // TODO: send SMS via AWS SNS (stub: log to console)
  console.log(`[OTP STUB] Phone: ${body.phoneNumber}, OTP: ${otp}`);

  return c.json({ message: 'OTP sent' }, 200);
});

// POST /api/v1/auth/confirm-phone
authRouter.post('/confirm-phone', authenticate, async (c) => {
  const body = confirmPhoneSchema.parse(await c.req.json());
  const auth = c.get('auth');

  const result = await query<{ id: string; code_hash: string }>(
    `SELECT id, code_hash FROM otp_records
     WHERE user_id = $1 AND phone = $2 AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [auth.userId, body.phoneNumber],
  );

  const record = result.rows[0];
  if (!record) {
    throw Errors.unprocessable('INVALID_OTP', 'OTP is invalid or has expired');
  }

  const valid = await bcrypt.compare(body.otp, record.code_hash);
  if (!valid) {
    throw Errors.unprocessable('INVALID_OTP', 'OTP is invalid or has expired');
  }

  await query(`UPDATE otp_records SET used = TRUE WHERE id = $1`, [record.id]);
  await query(
    `UPDATE users SET phone_number = $1, phone_verified = TRUE, updated_at = NOW()
     WHERE id = $2`,
    [body.phoneNumber, auth.userId],
  );

  return c.json({ message: 'Phone verified' }, 200);
});

// POST /api/v1/auth/clerk-webhook
authRouter.post('/clerk-webhook', async (c) => {
  // TODO: verify Clerk webhook signature (svix)
  const event = await c.req.json<{ type: string; data: Record<string, unknown> }>();

  if (event.type === 'user.created') {
    const data = event.data;
    const clerkUserId = data['id'] as string;
    const email =
      (data['email_addresses'] as Array<{ email_address: string }>)[0]?.email_address ?? '';
    const name = `${data['first_name'] ?? ''} ${data['last_name'] ?? ''}`.trim();
    const role =
      (data['public_metadata'] as Record<string, string> | undefined)?.['role'] ?? 'driver';

    await query(
      `INSERT INTO users (clerk_user_id, email, name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_user_id) DO NOTHING`,
      [clerkUserId, email, name, role],
    );
  }

  if (event.type === 'user.updated') {
    const data = event.data;
    const clerkUserId = data['id'] as string;
    const emailVerified =
      (data['email_addresses'] as Array<{ verification: { status: string } }>)[0]?.verification
        ?.status === 'verified';

    await query(
      `UPDATE users SET email_verified = $1, updated_at = NOW() WHERE clerk_user_id = $2`,
      [emailVerified, clerkUserId],
    );
  }

  return c.json({ received: true });
});
