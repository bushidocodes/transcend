// Baseline (issue #133): the schema as it stood when migrations were adopted — the `users`
// table exactly as `sequelize.sync()` had been creating it (snake_case columns from the
// `underscored` define option; the model's VIRTUAL `password` has no column).
//
// Adoption on an EXISTING database: if the table is already there (created by sync() before
// migrations existed), this records itself as executed without touching anything. Note the
// usual baseline caveat: `down` drops the table even if this migration only adopted it.

import type { MigrationContext } from '../db/migrator.ts';

export async function up({
  context: { queryInterface, Sequelize }
}: {
  context: MigrationContext;
}): Promise<void> {
  const tables = await queryInterface.showAllTables();
  if (tables.includes('users')) {
    console.log('baseline: users table already exists — adopting it as-is');
    return;
  }
  await queryInterface.createTable('users', {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    name: Sequelize.STRING,
    display_name: Sequelize.STRING,
    skin: Sequelize.STRING,
    email: Sequelize.STRING,
    google_id: Sequelize.STRING,
    password_digest: Sequelize.STRING,
    created_at: { type: Sequelize.DATE, allowNull: false },
    updated_at: { type: Sequelize.DATE, allowNull: false }
  });
  await queryInterface.addIndex('users', {
    fields: ['email'],
    unique: true,
    name: 'users_email'
  });
}

export async function down({
  context: { queryInterface }
}: {
  context: MigrationContext;
}): Promise<void> {
  await queryInterface.dropTable('users');
}
