// Unit tests for the seed production guard (issue #233).
// describe/it/expect are Vitest globals (test.globals).

import { assertSeedAllowed } from './seed-guard.ts';

describe('assertSeedAllowed (issue #233)', () => {
  it('allows seed in development with no extra flags', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('allows seed when NODE_ENV is unset', () => {
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
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', SEED_ALLOW_FORCE: 'true' })
    ).toThrow(/production/i);
  });

  it('allows production only when SEED_ALLOW_FORCE=1', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', SEED_ALLOW_FORCE: '1' })
    ).not.toThrow();
  });
});
