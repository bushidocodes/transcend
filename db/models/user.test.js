const db = require('../index');
const User = require('./user');

// describe/it/expect/beforeAll are provided as globals by Vitest (test.globals).

describe('User', () => {
  // prepare() force-syncs the dedicated test DB (NODE_ENV=testing) — the one remaining sync().
  beforeAll(() => db.prepare());

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
});
