// Unit tests for the seed production guard (issue #233).
// describe/it/expect are Vitest globals (test.globals).

import { assertSeedAllowed, isLocalDatabaseUrl } from './seed-guard.ts';

describe('assertSeedAllowed (issue #233)', () => {
  it('allows seed in development with no extra flags', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('allows seed when NODE_ENV is unset and no remote DATABASE_URL', () => {
    expect(() => assertSeedAllowed({})).not.toThrow();
  });

  it('allows seed in testing', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'testing' })).not.toThrow();
  });

  it('refuses seed in production without SEED_ALLOW_FORCE', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(/production/i);
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(/SEED_ALLOW_FORCE/);
  });

  it('refuses when SEED_ALLOW_FORCE is set to a non-1 value in production', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production', SEED_ALLOW_FORCE: 'true' })).toThrow(
      /production/i
    );
  });

  it('allows production only when SEED_ALLOW_FORCE=1', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', SEED_ALLOW_FORCE: '1' })
    ).not.toThrow();
  });

  it('refuses a non-localhost DATABASE_URL even when NODE_ENV is unset', () => {
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL: 'postgres://user:pass@prod.example.com:5432/transcend'
      })
    ).toThrow(/localhost/i);
  });

  it('allows a localhost DATABASE_URL without force', () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://localhost:5432/transcend'
      })
    ).not.toThrow();
  });

  it('allows remote DATABASE_URL only when SEED_ALLOW_FORCE=1', () => {
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL: 'postgres://user:pass@prod.example.com:5432/transcend',
        SEED_ALLOW_FORCE: '1'
      })
    ).not.toThrow();
  });
});

describe('isLocalDatabaseUrl', () => {
  it('treats empty as local (no URL to protect)', () => {
    expect(isLocalDatabaseUrl(undefined)).toBe(true);
    expect(isLocalDatabaseUrl('')).toBe(true);
  });

  it('accepts common loopback hosts', () => {
    expect(isLocalDatabaseUrl('postgres://localhost:5432/db')).toBe(true);
    expect(isLocalDatabaseUrl('postgres://127.0.0.1:5432/db')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://user:pass@localhost/db')).toBe(true);
  });

  it('rejects remote hosts', () => {
    expect(isLocalDatabaseUrl('postgres://db.internal:5432/db')).toBe(false);
    expect(isLocalDatabaseUrl('postgres://user:pass@8.8.8.8:5432/db')).toBe(false);
  });
});
