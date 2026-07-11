const { styleText } = require('node:util');
const Sequelize = require('sequelize');

// SQL query logging (replaces the `debug` dep): set DEBUG=sql (or DEBUG=*) to print
// each query Sequelize runs. Disabled otherwise, matching `debug('sql')`'s no-op behaviour.
const debugEnabled = (process.env.DEBUG || '')
  .split(/[,\s]+/)
  .some(ns => ns === 'sql' || ns === '*');
const sqlLogging = debugEnabled ? msg => console.error(`sql ${msg}`) : false;

const name = process.env.DATABASE_NAME || ('transcend' + (process.env.NODE_ENV === 'testing' ? '_test' : ''));
const defaultUrl = `postgres://localhost:5432/${name}`;

// When testing, prefer DATABASE_TEST_URL so a shell-exported DATABASE_URL
// (pointing at the live dev DB) can't accidentally wipe it via force-sync.
const url = (process.env.NODE_ENV === 'testing' ? process.env.DATABASE_TEST_URL : null) ||
  process.env.DATABASE_URL ||
  defaultUrl;
console.log(styleText('blue', `Opening database connection to ${url}`));

// Create the database instance. The resolved URL is exported for the one other consumer of
// this database: the express-session Postgres store (server/index.js, issue #122), so the
// env-precedence logic above isn't duplicated there.
const db = module.exports = new Sequelize(url, {
  logging: sqlLogging, // export DEBUG=sql in the environment to get SQL queries
  define: {
    underscored: true,       // use snake_case rather than camelCase column names
    freezeTableName: true,   // don't change table names from the one specified
    timestamps: true         // automatically include timestamp columns
  }
});

db.connectionUrl = url;

// Pull in our models
require('./models');

// Dev/test convenience: create the target database if it doesn't exist, connecting to the
// server's maintenance DB at the SAME host/port as the configured URL. This replaces the old
// `createdb` child-process retry loop, which shelled out with no host/port and so targeted
// whatever PGHOST/PGPORT defaulted to — not necessarily the database DATABASE_URL points at
// (issue #133). Never runs in production.
async function ensureDatabaseExists () {
  const { Client } = require('pg');
  const dbName = new URL(url).pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (existing.rowCount === 0) {
      console.log(styleText('blue', `Creating database ${dbName}...`));
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}

// Bring the database to a usable state (issue #133):
// - testing: force-sync the dedicated test DB from the models — the ONLY remaining sync() —
//   so the suite always starts from a clean slate;
// - everywhere else: run pending umzug migrations (migrations/*.js). Production boot never
//   calls sync(); schema changes to a live database ship as migrations.
async function doPrepare () {
  if (process.env.NODE_ENV === 'testing') {
    await db.sync({ force: true });
    console.log(styleText('blue', `Force-synced test db ${url}`));
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    // Best-effort: if this fails (e.g. auth), fall through and let the migrator surface the
    // real connection error.
    await ensureDatabaseExists().catch(() => {});
  }
  const createMigrator = require('./migrator');
  await createMigrator(db).up();
  console.log(styleText('blue', `Migrations up to date on ${url}`));
}

// Lazy and memoized (replaces the old eager `didSync` floating promise, #121/#133): nothing
// touches the network until a caller actually asks — so requiring the db (models in unit
// tests, the migration CLI) starts no connection. The server boot gate awaits this before
// listen and exits non-zero on rejection; the caller owns the promise, so there's no
// unhandled-rejection swallow-catch anymore.
let prepared = null;
db.prepare = () => {
  if (!prepared) {
    prepared = doPrepare().catch(fail => {
      console.error(styleText('red', '********** database error ***********'));
      console.error(styleText('red', `Couldn't prepare ${url}`));
      console.error();
      console.error(styleText('red', String(fail)));
      console.error(styleText('red', '*************************************'));
      throw fail;
    });
  }
  return prepared;
};
