// Migration CLI (issue #133): `node db/migrate-cli.ts <up|down|pending|executed>` — wired to
// `npm run migrate` / `npm run migrate:undo`. Importing db/index no longer connects or runs
// anything on its own (prepare() is lazy), so `down` really only runs down.
import db from './index.ts';
import createMigrator from './migrator.ts';

createMigrator(db)
  .runAsCLI()
  .then(ok => {
    db.close();
    if (!ok) process.exitCode = 1;
  });
