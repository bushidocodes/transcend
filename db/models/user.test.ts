import { prepare } from '../index.ts';
import User, { BCRYPT_ROUNDS } from './user.ts';

// describe/it/expect/beforeAll are provided as globals by Vitest (test.globals).

describe('User', () => {
  // prepare() force-syncs the dedicated test DB (NODE_ENV=testing) — the one remaining sync().
  beforeAll(() => prepare());

  describe('authenticate(plaintext: String) ~> Boolean', () => {
    it('resolves true if the password matches', () =>
      User.create({ email: 'match@example.com', password: 'ok' })
        .then(user => user.authenticate('ok'))
        .then(result => expect(result).toBe(true)));

    it("resolves false if the password doesn't match", () =>
      User.create({ email: 'mismatch@example.com', password: 'ok' })
        .then(user => user.authenticate('not ok'))
        .then(result => expect(result).toBe(false)));

    // Regression for #138: passwordless rows (Google OAuth) used to make bcrypt throw and
    // surface as HTTP 500 on local login. Must resolve false without rejecting.
    it('resolves false when password_digest is null (passwordless / Google account)', async () => {
      const user = await User.create({
        email: 'oauth@example.com',
        googleId: 'google-oauth-subject-123'
        // no password → setEmailAndPassword leaves password_digest null
      });
      expect(user.password_digest).toBeNull();
      await expect(user.authenticate('anything')).resolves.toBe(false);
    });
  });

  // Issue #207: new password digests must use the shipped cost factor (BCRYPT_ROUNDS), not the
  // old default of 10. Drive User.create so setEmailAndPassword → bcrypt.hash runs for real.
  describe('password hashing cost (issue #207)', () => {
    it('exports BCRYPT_ROUNDS at the recommended floor of 12', () => {
      expect(BCRYPT_ROUNDS).toBeGreaterThanOrEqual(12);
      expect(BCRYPT_ROUNDS).toBe(12);
    });

    it('stores password_digest with cost matching BCRYPT_ROUNDS', async () => {
      const user = await User.create({
        email: 'bcrypt-cost@example.com',
        password: 'cost-check-secret'
      });
      expect(user.password_digest).toBeTruthy();
      // Modular crypt format: $2a$12$... / $2b$12$ — cost is the two digits after the second $.
      const match = /^\$2[aby]?\$(\d{2})\$/.exec(user.password_digest!);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBe(BCRYPT_ROUNDS);
    });
  });
});
