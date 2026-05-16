import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE availability_rules (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parking_spot_id UUID NOT NULL REFERENCES parking_spots(id) ON DELETE CASCADE,
      day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time      TIME NOT NULL,
      end_time        TIME NOT NULL,
      timezone        TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql('CREATE INDEX idx_availability_rules_spot ON availability_rules(parking_spot_id)');

  pgm.sql(`
    CREATE TABLE availability_blocks (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parking_spot_id UUID NOT NULL REFERENCES parking_spots(id) ON DELETE CASCADE,
      start_time      TIMESTAMPTZ NOT NULL,
      end_time        TIMESTAMPTZ NOT NULL,
      reason          TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  pgm.sql(`
    CREATE INDEX idx_availability_blocks_spot_time
      ON availability_blocks(parking_spot_id, start_time, end_time)
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS availability_blocks');
  pgm.sql('DROP TABLE IF EXISTS availability_rules');
}
