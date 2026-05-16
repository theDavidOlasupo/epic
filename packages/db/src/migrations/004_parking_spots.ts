import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE parking_spots (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      host_id               UUID NOT NULL REFERENCES users(id),
      title                 TEXT NOT NULL,
      address               TEXT NOT NULL,
      location              GEOGRAPHY(POINT, 4326) NOT NULL,
      latitude              DOUBLE PRECISION NOT NULL,
      longitude             DOUBLE PRECISION NOT NULL,
      type                  TEXT NOT NULL CHECK (type IN (
                              'driveway','garage','lot','underground','other')),
      price_per_hour        INTEGER NOT NULL,
      photos                TEXT[] NOT NULL DEFAULT '{}',
      rules                 TEXT[] NOT NULL DEFAULT '{}',
      entry_instructions    TEXT NOT NULL DEFAULT '',
      max_vehicle_size      TEXT CHECK (max_vehicle_size IN (
                              'compact','mid_size','full_size','suv','truck','van')),
      height_restriction_cm INTEGER,
      is_covered            BOOLEAN NOT NULL DEFAULT FALSE,
      allow_overnight       BOOLEAN NOT NULL DEFAULT FALSE,
      cancellation_policy   TEXT NOT NULL DEFAULT 'standard',
      status                TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN (
                                'draft','pending_review','active','paused','rejected')),
      rejection_reason      TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql('CREATE INDEX idx_parking_spots_location ON parking_spots USING GIST(location)');
  pgm.sql('CREATE INDEX idx_parking_spots_status ON parking_spots(status)');
  pgm.sql('CREATE INDEX idx_parking_spots_host_id ON parking_spots(host_id)');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS parking_spots');
}
