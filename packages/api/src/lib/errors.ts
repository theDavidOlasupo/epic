export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// ── Convenience factories ──────────────────────────────────────────────────

export const Errors = {
  unauthorized: (msg = 'Unauthorized') => new AppError('UNAUTHORIZED', msg, 401),
  forbidden: (msg = 'Forbidden') => new AppError('FORBIDDEN', msg, 403),
  notFound: (resource = 'Resource') => new AppError('NOT_FOUND', `${resource} not found`, 404),
  conflict: (code: string, msg: string) => new AppError(code, msg, 409),
  unprocessable: (code: string, msg: string, details?: Record<string, unknown>) =>
    new AppError(code, msg, 422, details),
  tooManyRequests: (code: string, msg: string) => new AppError(code, msg, 429),
  accountSuspended: () => new AppError('ACCOUNT_SUSPENDED', 'Account is suspended', 403),
  accountBanned: () => new AppError('ACCOUNT_BANNED', 'Account is banned', 403),
};
