import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const direction = (process.argv[2] ?? 'up') as 'up' | 'down';

await runner({
  databaseUrl: process.env['DATABASE_URL'] ?? 'postgres://alpaca:alpaca@localhost:5432/alpaca',
  migrationsTable: 'pgmigrations',
  dir: resolve(__dirname, 'migrations'),
  direction,
  verbose: true,
});
