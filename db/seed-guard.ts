// Pure production guard for the destructive seed path (issue #233). Extracted so unit tests
// can cover the policy without running force-sync against a real database.

export type SeedEnv = {
  NODE_ENV?: string;
  SEED_ALLOW_FORCE?: string;
  DATABASE_URL?: string;
};

/** True when the URL host is a loopback address (or URL is empty / unparseable without a host). */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url || !url.trim()) return true;
  try {
    // URL() needs a scheme; postgres:// and postgresql:// are valid.
    const normalized = url.includes('://') ? url : `postgres://${url}`;
    const host = new URL(normalized).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
  } catch {
    // Fallback for odd connection strings: treat unknown shapes as non-local (fail closed).
    return /@(localhost|127\.0\.0\.1|\[::1\])([:/?]|$)/i.test(url);
  }
}

/**
 * Throws when a destructive seed (db.sync({ force: true })) must not run.
 *
 * Policy:
 * - Always allow when SEED_ALLOW_FORCE=1 (explicit wipe).
 * - Refuse when NODE_ENV is `production` (issue #233).
 * - Refuse when DATABASE_URL points at a non-localhost host, even if NODE_ENV is unset —
 *   the motivating footgun is a stray prod DATABASE_URL in the shell with no NODE_ENV.
 * Dev/test seeds against local Postgres keep working with no extra env vars.
 */
export function assertSeedAllowed(env: SeedEnv = process.env): void {
  if (env.SEED_ALLOW_FORCE === '1') return;

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing destructive seed: NODE_ENV=production would force-drop all tables. ' +
        'Point DATABASE_URL at a disposable database and set SEED_ALLOW_FORCE=1 only if you ' +
        'intentionally want to wipe it.'
    );
  }

  if (env.DATABASE_URL && !isLocalDatabaseUrl(env.DATABASE_URL)) {
    throw new Error(
      'Refusing destructive seed: DATABASE_URL host is not localhost. ' +
        'Point at a disposable local database, or set SEED_ALLOW_FORCE=1 only if you ' +
        'intentionally want to wipe it.'
    );
  }
}
