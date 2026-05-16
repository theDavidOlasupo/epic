import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE bookings (
      id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      driver_id                 UUID NOT NULL REFERENCES users(id),
      parking_spot_id           UUID NOT NULL REFERENCES parking_spots(id),
      vehicle_id                UUID NOT NULL REFERENCES vehicles(id),
      start_time                TIMESTAMPTZ NOT NULL,
      end_time                  TIMESTAMPTZ NOT NULL,
      total_price               INTEGER NOT NULL,
      currency                  CHAR(3) NOT NULL DEFAULT 'CAD',
      status                    TEXT NOT NULL DEFAULT 'pending'
                                  CHECK (status IN (
                                    'pending','confirmed','cancelled','expired','payment_failed')),
      stripe_payment_intent_id  TEXT,
      cancellation_reason       TEXT,
      cancelled_at              TIMESTAMPTZ,
      created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Exclusion constraint: no two confirmed bookings can overlap for the same spot
  pgm.sql(`
    ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
      EXCLUDE USING GIST (
        parking_spot_id WITH =,
        tstzrange(start_time, end_time, '[)') WITH &&
      ) WHERE (status = 'confirmed')
  `);

  pgm.sql('CREATE INDEX idx_bookings_driver_id ON bookings(driver_id)');
  pgm.sql('CREATE INDEX idx_bookings_spot_id ON bookings(parking_spot_id)');
  pgm.sql('CREATE INDEX idx_bookings_status ON bookings(status)');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS bookings');
}
