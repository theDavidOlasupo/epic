import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE host_payout_records (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id          UUID NOT NULL REFERENCES bookings(id),
      host_id             UUID NOT NULL REFERENCES users(id),
      gross_amount        INTEGER NOT NULL,
      platform_fee_amount INTEGER NOT NULL,
      host_earnings       INTEGER NOT NULL,
      currency            CHAR(3) NOT NULL,
      status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','paid','cancelled')),
      paid_at             TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql('CREATE INDEX idx_payout_records_host_id ON host_payout_records(host_id)');
  pgm.sql('CREATE INDEX idx_payout_records_booking_id ON host_payout_records(booking_id)');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS host_payout_records');
}
