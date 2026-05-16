import type { Context, Next } from 'hono';
import type { AuthContext, UserRole } from '@alpaca/types';
import type { AppEnv } from '../lib/hono-types.js';
import { Errors } from '../lib/errors.js';
import { query } from '@alpaca/db';

// ── JWT verification ───────────────────────────────────────────────────────

interface ClerkJWTPayload {
  sub: string;          // Clerk user ID
  email?: string;
  name?: string;
  [key: string]: unknown;
}

async function verifyToken(token: string): Promise<ClerkJWTPayload> {
  if (process.env['CLERK_STUB'] === 'true') {
    // Stub: token is base64-encoded JSON { clerkUserId: string }
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8')) as {
        clerkUserId: string;
      };
      return { sub: payload.clerkUserId };
    } catch {
      throw Errors.unauthorized('Invalid stub token');
    }
  }

  // Production: verify RS256 JWT against Clerk JWKS
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  const jwksUrl = process.env['CLERK_JWKS_URL'];
  const issuer = process.env['CLERK_ISSUER'];
  if (!jwksUrl || !issuer) {
    throw Errors.unauthorized('Auth provider not configured');
  }
  const JWKS = createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jwtVerify(token, JWKS, { issuer });
  return payload as ClerkJWTPayload;
}

// ── Auto-provision user on first request ──────────────────────────────────
// When a real Clerk JWT arrives for a user we haven't seen yet,
// create a minimal user record so they can use the API immediately.
// The Clerk webhook will fill in more details asynchronously.

async function getOrCreateUser(clerkUserId: string): Promise<{
  id: string;
  role: UserRole;
  status: string;
} | null> {
  const existing = await query<{ id: string; role: UserRole; status: string }>(
    'SELECT id, role, status FROM users WHERE clerk_user_id = $1',
    [clerkUserId],
  );
  if (existing.rows[0]) return existing.rows[0];

  // Auto-provision with default driver role
  const created = await query<{ id: string; role: UserRole; status: string }>(
    `INSERT INTO users (clerk_user_id, email, name, role)
     VALUES ($1, $2, $3, 'driver')
     ON CONFLICT (clerk_user_id) DO UPDATE SET updated_at = NOW()
     RETURNING id, role, status`,
    [clerkUserId, `${clerkUserId}@pending.local`, 'Pending User'],
  );
  return created.rows[0] ?? null;
}

// ── Middleware ─────────────────────────────────────────────────────────────

export async function authenticate(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw Errors.unauthorized('Missing or malformed Authorization header');
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  const clerkUserId = payload.sub;

  const user = await getOrCreateUser(clerkUserId);
  if (!user) throw Errors.unauthorized('User not found');

  if (user.status === 'suspended') throw Errors.accountSuspended();
  if (user.status === 'banned') throw Errors.accountBanned();

  const auth: AuthContext = {
    userId: user.id,
    clerkUserId,
    role: user.role,
    status: user.status as AuthContext['status'],
  };

  c.set('auth', auth);
  await next();
}

export function requireRole(...roles: UserRole[]) {
  return async (c: Context<AppEnv>, next: Next) => {
    const auth = c.get('auth');
    if (!roles.includes(auth.role)) {
      throw Errors.forbidden(`Role '${auth.role}' is not allowed to access this resource`);
    }
    await next();
  };
}
