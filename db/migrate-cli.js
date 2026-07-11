// Migration CLI (issue #133): `node db/migrate-cli.js <up|down|pending|executed>` — wired to
// `npm run migrate` / `npm run migrate:undo`. Requiring db/index no longer connects or runs
// anything on its own (db.prepare() is lazy), so `down` really only runs down.
const db = require('./index');
const createMigrator = require('./migrator');

createMigrator(db).runAsCLI().then(ok => {
  db.close();
  if (!ok) process.exitCode = 1;
});
