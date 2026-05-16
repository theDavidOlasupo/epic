import type { AuthContext } from '@alpaca/types';

/**
 * Shared Hono environment type.
 * Pass this as the generic to every Hono instance and middleware so that
 * c.get('auth') is typed as AuthContext instead of unknown.
 */
export type AppEnv = {
  Variables: {
    auth: AuthContext;
  };
};
