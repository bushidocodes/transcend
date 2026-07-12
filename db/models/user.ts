import bcrypt from 'bcryptjs';
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes
} from 'sequelize';
import db from '../instance.ts';

// Class-based model (Model.init) instead of the old db.define + prototype assignment: it's
// the Sequelize-v6-typed equivalent — instance methods and attribute types live on the class,
// so req.user and query results are fully typed.
export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare name: CreationOptional<string | null>;
  declare displayName: CreationOptional<string | null>;
  declare skin: CreationOptional<string | null>;
  declare email: string;
  declare googleId: CreationOptional<string | null>;
  declare password_digest: CreationOptional<string | null>;
  declare password: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  authenticate (plaintext: string): Promise<boolean> {
    // Google OAuth (and any other passwordless) accounts have password_digest = NULL.
    // bcrypt.compare(string, null) throws "Illegal arguments: string, object", which
    // LocalStrategy surfaces as a 500. Treat a missing digest as "no local password" and
    // fail the check cleanly so login returns the normal 401 (issue #138).
    const digest = this.password_digest;
    if (!digest) return Promise.resolve(false);

    return new Promise((resolve, reject) =>
      bcrypt.compare(plaintext, digest,
        (err, result) =>
          err ? reject(err) : resolve(!!result))
    );
  }

  // Never serialize the password hash (or the virtual plaintext password) to clients. This is
  // the single chokepoint for every response that returns a user — /local/login (via its
  // redirect to /whoami), /whoami, and /skin all go through JSON serialization (issue #89).
  // The instance keeps password_digest in memory, so authenticate() still works.
  toJSON (): object {
    const values: Record<string, unknown> = Object.assign({}, this.get());
    delete values.password_digest;
    delete values.password;
    return values;
  }
}

// id and the timestamps were implicit under db.define; the typed init requires every declared
// attribute, so they're spelled out with exactly the DDL Sequelize was generating for them
// anyway (see migrations/001-baseline.ts — the recorded output of that sync()).
User.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
  name: DataTypes.STRING,
  displayName: DataTypes.STRING,
  skin: DataTypes.STRING,
  // allowNull: false so the DB rejects NULL email even if a caller skips the route check
  // (issue #139). OAuth signup always supplies profile.emails[0].value.
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  },
  // For Google OAuth
  googleId: DataTypes.STRING,
  // OAuth -> users may or may not have passwords.
  password_digest: DataTypes.STRING,
  password: DataTypes.VIRTUAL,
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false }
}, {
  sequelize: db,
  modelName: 'users',
  indexes: [{ fields: ['email'], unique: true }],
  hooks: {
    beforeCreate: setEmailAndPassword,
    beforeUpdate: setEmailAndPassword
  }
});

// Sequelize ignores a hook's resolved value (HookReturn is Promise<void>); the mutation of
// `user` is the effect.
function setEmailAndPassword (user: User): Promise<void> {
  user.email = user.email && user.email.toLowerCase();
  const password = user.password;
  if (!password) return Promise.resolve();

  return new Promise((resolve, reject) =>
    bcrypt.hash(password, 10, (err, hash) => {
      if (err || hash === undefined) return reject(err);
      user.set('password_digest', hash);
      resolve();
    })
  );
}

export default User;
