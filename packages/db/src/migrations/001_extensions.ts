import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS postgis');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS btree_gist');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP EXTENSION IF EXISTS btree_gist');
  pgm.sql('DROP EXTENSION IF EXISTS postgis');
}
