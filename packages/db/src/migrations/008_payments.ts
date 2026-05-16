import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE payments (
      id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id                  UUID NOT NULL REFERENCES bookings(id),
      driver_id                   UUID NOT NULL REFERENCES users(id),
      amount                      INTEGER NOT NULL,
      currency                    CHAR(3) NOT NULL,
      provider                    TEXT NOT NULL DEFAULT 'stripe',
      provider_payment_intent_id  TEXT UNIQUE NOT NULL,
      status                      TEXT NOT NULL DEFAULT 'requires_payment'
                                    CHECK (status IN (
                                      'requires_payment','processing',
                                      'succeeded','failed','refunded')),
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql('CREATE INDEX idx_payments_booking_id ON payments(booking_id)');
  pgm.sql('CREATE INDEX idx_payments_intent_id ON payments(provider_payment_intent_id)');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS payments');
}
