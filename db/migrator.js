// Builds the umzug migrator over a Sequelize instance (issue #133). Separate from db/index.js
// so the CLI (db/migrate-cli.js) and the boot path share one definition, and so requiring it
// never runs anything by itself.
const path = require('path');
const Sequelize = require('sequelize');
const { Umzug, SequelizeStorage } = require('umzug');

module.exports = function createMigrator (sequelize) {
  return new Umzug({
    // Migration files live in <repo>/migrations and run in filename order.
    migrations: { glob: ['migrations/*.js', { cwd: path.resolve(__dirname, '..') }] },
    context: { queryInterface: sequelize.getQueryInterface(), Sequelize },
    // Executed-migration names are recorded in a "SequelizeMeta" table in the same database.
    storage: new SequelizeStorage({ sequelize }),
    logger: console
  });
};
