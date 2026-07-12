// Issue #234: unique index on users.google_id so Google login can look up by subject without
// a full-table scan, and so concurrent first-login cannot create duplicate googleId rows.
// Partial unique (WHERE google_id IS NOT NULL) so local-only accounts may all keep NULL.
//
// Pre-clean: the historical find-then-create Google path could race and leave duplicate
// google_id values. CREATE UNIQUE INDEX would abort (and block server boot via prepare())
// if those rows still exist — collapse them first (keep lowest id, clear the rest).

import type { MigrationContext } from '../db/migrator.ts';

export const INDEX_NAME = 'users_google_id_unique';

export async function up({
  context: { queryInterface }
}: {
  context: MigrationContext;
}): Promise<void> {
  // Collapse duplicate google_id rows so the unique index can apply. Keep the earliest
  // account (lowest id); later duplicates lose google_id and can re-link on next OAuth.
  const [cleared] = await queryInterface.sequelize.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY google_id ORDER BY id) AS rn
      FROM users
      WHERE google_id IS NOT NULL
    ),
    doomed AS (
      UPDATE users u
      SET google_id = NULL
      FROM ranked r
      WHERE u.id = r.id AND r.rn > 1
      RETURNING u.id
    )
    SELECT count(*)::int AS n FROM doomed
  `);
  const n =
    Array.isArray(cleared) && cleared[0] && typeof (cleared[0] as { n?: unknown }).n === 'number'
      ? (cleared[0] as { n: number }).n
      : 0;
  if (n > 0) {
    console.warn(
      `003-google-id-unique: cleared google_id on ${n} duplicate row(s); kept lowest id per google_id`
    );
  }

  // Sequelize's addIndex does not express partial unique indexes portably; use raw SQL for
  // Postgres (the only dialect this app runs).
  await queryInterface.sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "${INDEX_NAME}" ON users (google_id) WHERE google_id IS NOT NULL`
  );
}

export async function down({
  context: { queryInterface }
}: {
  context: MigrationContext;
}): Promise<void> {
  await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${INDEX_NAME}"`);
}
