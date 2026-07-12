import { styleText } from 'node:util';
import { Sequelize } from 'sequelize';

// The bare Sequelize instance + resolved connection URL, split out of db/index.ts so model
// modules can import it without a cycle: index imports models, models import the instance.
// (Under CommonJS the old single-file layout worked because require() runs in source order;
// ESM imports are hoisted, so a models -> index back-edge would hit the const before it
// initialized.) Everything else should import db/index.ts, which registers the models.

// SQL query logging (replaces the `debug` dep): set DEBUG=sql (or DEBUG=*) to print
// each query Sequelize runs. Disabled otherwise, matching `debug('sql')`'s no-op behaviour.
const debugEnabled = (process.env.DEBUG || '')
  .split(/[,\s]+/)
  .some(ns => ns === 'sql' || ns === '*');
const sqlLogging = debugEnabled ? (msg: string) => console.error(`sql ${msg}`) : false;

const name = process.env.DATABASE_NAME || ('transcend' + (process.env.NODE_ENV === 'testing' ? '_test' : ''));
const defaultUrl = `postgres://localhost:5432/${name}`;

// When testing, prefer DATABASE_TEST_URL so a shell-exported DATABASE_URL
// (pointing at the live dev DB) can't accidentally wipe it via force-sync.
const url = (process.env.NODE_ENV === 'testing' ? process.env.DATABASE_TEST_URL : null) ||
  process.env.DATABASE_URL ||
  defaultUrl;
console.log(styleText('blue', `Opening database connection to ${url}`));

// The resolved URL is exported for the one other consumer of this database: the
// express-session Postgres store (server/index.ts, issue #122), so the env-precedence logic
// above isn't duplicated there.
export const connectionUrl = url;

const db = new Sequelize(url, {
  logging: sqlLogging, // export DEBUG=sql in the environment to get SQL queries
  define: {
    underscored: true, // use snake_case rather than camelCase column names
    freezeTableName: true, // don't change table names from the one specified
    timestamps: true // automatically include timestamp columns
  }
});

export default db;
