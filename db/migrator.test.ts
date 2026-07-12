/**
 * Unit tests for createMigrator (issue #175).
 *
 * Builds a migrator against a mocked Sequelize instance and asserts the umzug config shape:
 * migrations glob, context (queryInterface + DataTypes), and SequelizeStorage wiring.
 */

import { Umzug, SequelizeStorage } from 'umzug';
import { DataTypes } from 'sequelize';
import createMigrator from './migrator.ts';

function mockSequelize() {
  const queryInterface = { mock: 'queryInterface' };
  // SequelizeStorage reads sequelize.constructor.DataTypes.STRING and may call
  // isDefined/define/model when constructing the SequelizeMeta model.
  function SequelizeCtor() {}
  SequelizeCtor.DataTypes = DataTypes;

  const sequelize = {
    getQueryInterface: vi.fn(() => queryInterface),
    isDefined: vi.fn(() => false),
    define: vi.fn(() => ({})),
    model: vi.fn(),
    models: {},
    query: vi.fn(),
    dialect: { name: 'postgres' },
    constructor: SequelizeCtor
  };
  return sequelize as unknown as import('sequelize').Sequelize;
}

describe('createMigrator', () => {
  it('returns an Umzug instance', () => {
    const sequelize = mockSequelize();
    const migrator = createMigrator(sequelize);
    expect(migrator).toBeInstanceOf(Umzug);
  });

  it('wires context with queryInterface and DataTypes (as Sequelize)', () => {
    const sequelize = mockSequelize();
    const migrator = createMigrator(sequelize);
    // umzug exposes the options it was constructed with.
    const options = (
      migrator as unknown as {
        options: { context: { queryInterface: unknown; Sequelize: unknown } };
      }
    ).options;
    expect(sequelize.getQueryInterface).toHaveBeenCalled();
    expect(options.context.queryInterface).toEqual({ mock: 'queryInterface' });
    expect(options.context.Sequelize).toBe(DataTypes);
  });

  it('uses SequelizeStorage for executed-migration recording', () => {
    const sequelize = mockSequelize();
    const migrator = createMigrator(sequelize);
    const options = (migrator as unknown as { options: { storage: unknown } }).options;
    expect(options.storage).toBeInstanceOf(SequelizeStorage);
  });

  it('configures migrations via a glob under migrations/*.ts', () => {
    const sequelize = mockSequelize();
    const migrator = createMigrator(sequelize);
    const options = (
      migrator as unknown as {
        options: { migrations: { glob: [string, { cwd: string }] } };
      }
    ).options;
    // createMigrator passes { glob: ['migrations/*.ts', { cwd }] }.
    expect(options.migrations.glob[0]).toBe('migrations/*.ts');
    expect(typeof options.migrations.glob[1].cwd).toBe('string');
    expect(options.migrations.glob[1].cwd.length).toBeGreaterThan(0);
  });
});
