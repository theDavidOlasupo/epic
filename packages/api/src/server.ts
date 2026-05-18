import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// In production (Railway) env vars are injected directly — dotenv is a no-op.
// In local dev, load from .env at the monorepo root.
if (process.env['NODE_ENV'] !== 'production') {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  config({ path: resolve(__dirname, '../../../.env') });
}

import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env['PORT'] ?? 4000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`🦙 Alpaca Parking API running at http://localhost:${port}`);
});
