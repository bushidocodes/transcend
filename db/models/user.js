const bcrypt = require('bcryptjs');
const Sequelize = require('sequelize');
const db = require('../index');

const User = db.define('users', {
  name: Sequelize.STRING,
  displayName: Sequelize.STRING,
  skin: Sequelize.STRING,
  // allowNull: false so the DB rejects NULL email even if a caller skips the route check
  // (issue #139). OAuth signup always supplies profile.emails[0].value.
  email: {
    type: Sequelize.STRING,
    allowNull: false,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  },
  // For Google OAuth
  googleId: Sequelize.STRING,
  // OAuth -> users may or may not have passwords.
  password_digest: Sequelize.STRING,
  password: Sequelize.VIRTUAL
}, {
  indexes: [{ fields: ['email'], unique: true }],
  hooks: {
    beforeCreate: setEmailAndPassword,
    beforeUpdate: setEmailAndPassword
  }
});

User.prototype.authenticate = function (plaintext) {
  return new Promise((resolve, reject) =>
    bcrypt.compare(plaintext, this.password_digest,
      (err, result) =>
        err ? reject(err) : resolve(result))
  );
};

// Never serialize the password hash (or the virtual plaintext password) to clients. This is
// the single chokepoint for every response that returns a user — /local/login (via its
// redirect to /whoami), /whoami, and /skin all go through JSON serialization (issue #89).
// The instance keeps password_digest in memory, so authenticate() still works.
User.prototype.toJSON = function () {
  const values = Object.assign({}, this.get());
  delete values.password_digest;
  delete values.password;
  return values;
};

function setEmailAndPassword (user) {
  user.email = user.email && user.email.toLowerCase();
  if (!user.password) return Promise.resolve(user);

  return new Promise((resolve, reject) =>
    bcrypt.hash(user.get('password'), 10, (err, hash) => {
      if (err) reject(err);
      user.set('password_digest', hash);
      resolve(user);
    })
  );
}

module.exports = User;
