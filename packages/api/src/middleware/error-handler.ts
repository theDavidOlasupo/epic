import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorResponse } from '@alpaca/types';
import { AppError } from '../lib/errors.js';
import { ZodError } from 'zod';

export function errorHandler(err: Error, c: Context) {
  try {
    console.error('[error]', err?.message, err?.stack);
  } catch {
    console.error('[error] (could not serialize error)');
  }

  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    return c.json(response, err.statusCode as ContentfulStatusCode);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: { issues: err.issues },
      },
    };
    return c.json(response, 422);
  }

  console.error('[unhandled error type]', err?.constructor?.name, err?.message);

  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: err?.message ?? 'An unexpected error occurred',
    },
  };
  return c.json(response, 500);
}
