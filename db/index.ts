import { styleText } from 'node:util';
import db, { connectionUrl } from './instance.ts';
// Importing for its side effect: registers the models onto the instance so callers of this
// module can use db.model('users') / the exported model classes.
import './models/index.ts';

export { connectionUrl };

// Dev/test convenience: create the target database if it doesn't exist, connecting to the
// server's maintenance DB at the SAME host/port as the configured URL. This replaces the old
// `createdb` child-process retry loop, which shelled out with no host/port and so targeted
// whatever PGHOST/PGPORT defaulted to — not necessarily the database DATABASE_URL points at
// (issue #133). Never runs in production.
async function ensureDatabaseExists (): Promise<void> {
  const { Client } = await import('pg');
  const dbName = new URL(connectionUrl).pathname.slice(1);
  const adminUrl = new URL(connectionUrl);
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
// - everywhere else: run pending umzug migrations (migrations/*.ts). Production boot never
//   calls sync(); schema changes to a live database ship as migrations.
async function doPrepare (): Promise<void> {
  if (process.env.NODE_ENV === 'testing') {
    await db.sync({ force: true });
    console.log(styleText('blue', `Force-synced test db ${connectionUrl}`));
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    // Best-effort: if this fails (e.g. auth), fall through and let the migrator surface the
    // real connection error.
    await ensureDatabaseExists().catch(() => {});
  }
  const { default: createMigrator } = await import('./migrator.ts');
  await createMigrator(db).up();
  console.log(styleText('blue', `Migrations up to date on ${connectionUrl}`));
}

// Lazy and memoized (replaces the old eager `didSync` floating promise, #121/#133): nothing
// touches the network until a caller actually asks — so importing the db (models in unit
// tests, the migration CLI) starts no connection. The server boot gate awaits this before
// listen and exits non-zero on rejection; the caller owns the promise, so there's no
// unhandled-rejection swallow-catch anymore.
let prepared: Promise<void> | null = null;
export const prepare = (): Promise<void> => {
  if (!prepared) {
    prepared = doPrepare().catch(fail => {
      console.error(styleText('red', '********** database error ***********'));
      console.error(styleText('red', `Couldn't prepare ${connectionUrl}`));
      console.error();
      console.error(styleText('red', String(fail)));
      console.error(styleText('red', '*************************************'));
      throw fail;
    });
  }
  return prepared;
};

export default db;
