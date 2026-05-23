import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { usersRouter } from './routes/users.js';
import { vehiclesRouter } from './routes/vehicles.js';
import { parkingSpotsRouter } from './routes/parking-spots.js';
import { bookingsRouter } from './routes/bookings.js';
import { paymentsRouter } from './routes/payments.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { guestBookingsRouter } from './routes/guest-bookings.js';
import { feedbackRouter } from './routes/feedback.js';
import { errorHandler } from './middleware/error-handler.js';
import type { AppEnv } from './lib/hono-types.js';

export const app = new Hono<AppEnv>();

// ── Global middleware ──────────────────────────────────────────────────────
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── API routes ─────────────────────────────────────────────────────────────
app.route('/api/v1/auth', authRouter);
app.route('/api/v1/users', usersRouter);
app.route('/api/v1/users/me/vehicles', vehiclesRouter);
app.route('/api/v1/parking-spots', parkingSpotsRouter);
app.route('/api/v1/bookings/guest', guestBookingsRouter);
app.route('/api/v1/bookings', bookingsRouter);
app.route('/api/v1/payments', paymentsRouter);
app.route('/api/v1/feedback', feedbackRouter);
app.route('/api/v1/admin', adminRouter);

// ── Global error handler ───────────────────────────────────────────────────
app.onError(errorHandler);

// ── 404 fallback ───────────────────────────────────────────────────────────
app.notFound((c) =>
  c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404),
);
