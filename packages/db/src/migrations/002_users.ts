import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE users (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clerk_user_id    TEXT UNIQUE NOT NULL,
      email            TEXT UNIQUE NOT NULL,
      name             TEXT NOT NULL,
      phone_number     TEXT,
      role             TEXT NOT NULL CHECK (role IN ('driver', 'host', 'admin')),
      status           TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'suspended', 'banned')),
      email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
      phone_verified   BOOLEAN NOT NULL DEFAULT FALSE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS users');
}
