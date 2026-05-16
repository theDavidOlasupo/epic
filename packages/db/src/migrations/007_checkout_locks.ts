import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE checkout_locks (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parking_spot_id UUID NOT NULL REFERENCES parking_spots(id),
      driver_id       UUID NOT NULL REFERENCES users(id),
      start_time      TIMESTAMPTZ NOT NULL,
      end_time        TIMESTAMPTZ NOT NULL,
      expires_at      TIMESTAMPTZ NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // NOTE: We intentionally skip the EXCLUDE constraint here.
  // PostgreSQL requires IMMUTABLE functions in partial index predicates,
  // but NOW() is VOLATILE. Overlap prevention for active locks is enforced
  // in the application layer (bookings.ts) before insert.

  pgm.sql('CREATE INDEX idx_checkout_locks_spot ON checkout_locks(parking_spot_id)');
  pgm.sql('CREATE INDEX idx_checkout_locks_driver ON checkout_locks(driver_id)');
  pgm.sql('CREATE INDEX idx_checkout_locks_expires ON checkout_locks(expires_at)');

  // Composite index to efficiently find active overlapping locks
  pgm.sql(`
    CREATE INDEX idx_checkout_locks_spot_time_expires
      ON checkout_locks(parking_spot_id, start_time, end_time, expires_at)
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS checkout_locks');
}
