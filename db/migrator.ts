// Builds the umzug migrator over a Sequelize instance (issue #133). Separate from db/index.ts
// so the CLI (db/migrate-cli.ts) and the boot path share one definition, and so importing it
// never runs anything by itself.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DataTypes, type QueryInterface, type Sequelize } from 'sequelize';
import { Umzug, SequelizeStorage } from 'umzug';

// What every migration's up/down receives. `Sequelize` is the DataTypes bag (STRING, DATE, …):
// the CommonJS version passed the Sequelize class, whose data-type statics are these same
// objects — DataTypes is the typed subset migrations actually use. Anything else a migration
// needs (raw SQL, transactions) hangs off queryInterface.
export interface MigrationContext {
  queryInterface: QueryInterface;
  Sequelize: typeof DataTypes;
}

export interface MigrationModule {
  up: (params: { context: MigrationContext }) => Promise<unknown>;
  down: (params: { context: MigrationContext }) => Promise<unknown>;
}

export default function createMigrator (sequelize: Sequelize): Umzug<MigrationContext> {
  return new Umzug<MigrationContext>({
    // Migration files live in <repo>/migrations and run in filename order. umzug's default
    // resolver refuses .ts (it predates Node's type stripping and suggests ts-node), so load
    // the module ourselves with a dynamic import — Node strips the types natively.
    migrations: {
      glob: ['migrations/*.ts', { cwd: path.resolve(import.meta.dirname, '..') }],
      resolve: ({ name, path: filepath, context }) => {
        const load = (): Promise<MigrationModule> => import(pathToFileURL(filepath!).href);
        return {
          // Migration names are the durable ids in every deployment's SequelizeMeta table, and
          // they were recorded with .js filenames before the TypeScript conversion. Keep
          // recording under the .js-era name so existing databases don't see every migration
          // as pending (and re-run it) after the rename.
          name: name.replace(/\.ts$/, '.js'),
          up: async () => (await load()).up({ context }),
          down: async () => (await load()).down({ context })
        };
      }
    },
    context: { queryInterface: sequelize.getQueryInterface(), Sequelize: DataTypes },
    // Executed-migration names are recorded in a "SequelizeMeta" table in the same database.
    storage: new SequelizeStorage({ sequelize }),
    logger: console
  });
}
