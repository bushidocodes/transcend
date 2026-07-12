// Shape check for migration 003 (issue #234). Does not hit a real DB.
// describe/it/expect are Vitest globals (test.globals).

import { INDEX_NAME, up, down } from '../migrations/003-google-id-unique.ts';

describe('003-google-id-unique migration (issue #234)', () => {
  it('exports a stable index name', () => {
    expect(INDEX_NAME).toBe('users_google_id_unique');
  });

  it('up creates a partial unique index on google_id', async () => {
    const queries: string[] = [];
    const queryInterface = {
      sequelize: {
        query: async (sql: string) => {
          queries.push(sql);
          return [undefined, undefined];
        }
      }
    };
    await up({
      context: { queryInterface, Sequelize: {} }
    } as Parameters<typeof up>[0]);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/CREATE UNIQUE INDEX/i);
    expect(queries[0]).toMatch(/google_id/);
    expect(queries[0]).toMatch(/WHERE google_id IS NOT NULL/i);
    expect(queries[0]).toContain(INDEX_NAME);
  });

  it('down drops the index by name', async () => {
    const queries: string[] = [];
    const queryInterface = {
      sequelize: {
        query: async (sql: string) => {
          queries.push(sql);
          return [undefined, undefined];
        }
      }
    };
    await down({
      context: { queryInterface, Sequelize: {} }
    } as Parameters<typeof down>[0]);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/DROP INDEX/i);
    expect(queries[0]).toContain(INDEX_NAME);
  });
});
