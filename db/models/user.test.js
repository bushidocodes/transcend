const db = require('../index');
const User = require('./user');

// describe/it/expect/beforeAll are provided as globals by Vitest (test.globals).

describe('User', () => {
  beforeAll(() => db.didSync);

  describe('authenticate(plaintext: String) ~> Boolean', () => {
    it('resolves true if the password matches', () =>
      User.create({ password: 'ok' })
        .then(user => user.authenticate('ok'))
        .then(result => expect(result).toBe(true)));

    it("resolves false if the password doesn't match", () =>
      User.create({ password: 'ok' })
        .then(user => user.authenticate('not ok'))
        .then(result => expect(result).toBe(false)));
  });
});
