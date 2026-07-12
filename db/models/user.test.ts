import bcrypt from 'bcryptjs';
import { prepare } from '../index.ts';
import User, {
  BCRYPT_ROUNDS,
  DUMMY_PASSWORD_DIGEST,
  comparePassword
} from './user.ts';

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
    // Issue #240: still runs a real bcrypt compare (dummy digest) so timing matches.
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

  // Issue #240: both null-digest and real-digest paths must invoke bcrypt.compare so
  // missing/OAuth accounts are not faster than wrong-password accounts.
  describe('comparePassword constant work (issue #240)', () => {
    it('exports a dummy digest at cost matching BCRYPT_ROUNDS', () => {
      const match = /^\$2[aby]?\$(\d{2})\$/.exec(DUMMY_PASSWORD_DIGEST);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBe(BCRYPT_ROUNDS);
    });

    it('returns false for a null digest and never authenticates the dummy hash', async () => {
      await expect(comparePassword('anything', null)).resolves.toBe(false);
      await expect(comparePassword('timing-dummy-not-a-real-password', null)).resolves.toBe(
        false
      );
    });

    it('returns true only when a real digest matches', async () => {
      const digest = await bcrypt.hash('correct-horse', BCRYPT_ROUNDS);
      await expect(comparePassword('correct-horse', digest)).resolves.toBe(true);
      await expect(comparePassword('wrong-battery', digest)).resolves.toBe(false);
    });

    it('invokes bcrypt.compare for both null and real digests', async () => {
      const spy = vi.spyOn(bcrypt, 'compare');
      try {
        await comparePassword('p', null);
        await comparePassword('p', DUMMY_PASSWORD_DIGEST);
        // Two compare calls: missing digest (dummy) + explicit dummy digest argument.
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy.mock.calls[0][1]).toBe(DUMMY_PASSWORD_DIGEST);
        expect(spy.mock.calls[1][1]).toBe(DUMMY_PASSWORD_DIGEST);
      } finally {
        spy.mockRestore();
      }
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
