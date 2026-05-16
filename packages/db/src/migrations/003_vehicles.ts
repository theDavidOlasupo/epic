import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE vehicles (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      make                  TEXT NOT NULL,
      model                 TEXT NOT NULL,
      year                  SMALLINT NOT NULL,
      size_class            TEXT NOT NULL CHECK (size_class IN (
                              'compact','mid_size','full_size','suv','truck','van','motorcycle')),
      licence_plate         TEXT NOT NULL,
      licence_plate_region  TEXT NOT NULL,
      is_default            BOOLEAN NOT NULL DEFAULT FALSE,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql('CREATE INDEX idx_vehicles_user_id ON vehicles(user_id)');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS vehicles');
}
