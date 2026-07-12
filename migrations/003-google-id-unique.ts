// Issue #234: unique index on users.google_id so Google login can look up by subject without
// a full-table scan, and so concurrent first-login cannot create duplicate googleId rows.
// Partial unique (WHERE google_id IS NOT NULL) so local-only accounts may all keep NULL.

import type { MigrationContext } from '../db/migrator.ts';

export const INDEX_NAME = 'users_google_id_unique';

export async function up({
  context: { queryInterface }
}: {
  context: MigrationContext;
}): Promise<void> {
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
