// Pure production guard for the destructive seed path (issue #233). Extracted so unit tests
// can cover the policy without running force-sync against a real database.

export type SeedEnv = {
  NODE_ENV?: string;
  SEED_ALLOW_FORCE?: string;
};

/**
 * Throws when a destructive seed (db.sync({ force: true })) must not run.
 *
 * Policy: refuse when NODE_ENV is `production` unless SEED_ALLOW_FORCE=1 is explicitly set.
 * Dev/test seeds keep working with no extra env vars.
 */
export function assertSeedAllowed(env: SeedEnv = process.env): void {
  if (env.NODE_ENV === 'production' && env.SEED_ALLOW_FORCE !== '1') {
    throw new Error(
      'Refusing destructive seed: NODE_ENV=production would force-drop all tables. ' +
        'Point DATABASE_URL at a disposable database and set SEED_ALLOW_FORCE=1 only if you ' +
        'intentionally want to wipe it.'
    );
  }
}
