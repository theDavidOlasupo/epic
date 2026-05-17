import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add is_guest flag to users
  pgm.sql(`ALTER TABLE users ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT FALSE`);

  // Add guest_token to bookings for unauthenticated booking lookup
  pgm.sql(`ALTER TABLE bookings ADD COLUMN guest_token TEXT UNIQUE`);
  pgm.sql(`CREATE INDEX idx_bookings_guest_token ON bookings(guest_token)`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS idx_bookings_guest_token`);
  pgm.sql(`ALTER TABLE bookings DROP COLUMN IF EXISTS guest_token`);
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS is_guest`);
}
