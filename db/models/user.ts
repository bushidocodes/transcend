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

  authenticate(plaintext: string): Promise<boolean> {
    // Always bcrypt-compare (including null digest → dummy hash) so OAuth-only rows
    // are not distinguishable from password mismatches by timing (issues #138, #240).
    return comparePassword(plaintext, this.password_digest);
  }

  // Never serialize the password hash (or the virtual plaintext password) to clients. This is
  // the single chokepoint for every response that returns a user — /local/login (via its
  // redirect to /whoami), /whoami, and /skin all go through JSON serialization (issue #89).
  // The instance keeps password_digest in memory, so authenticate() still works.
  toJSON(): object {
    const values: Record<string, unknown> = Object.assign({}, this.get());
    delete values.password_digest;
    delete values.password;
    return values;
  }
}

// id and the timestamps were implicit under db.define; the typed init requires every declared
// attribute, so they're spelled out with exactly the DDL Sequelize was generating for them
// anyway (see migrations/001-baseline.ts — the recorded output of that sync()).
User.init(
  {
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
  },
  {
    sequelize: db,
    modelName: 'users',
    indexes: [
      { fields: ['email'], unique: true },
      // Unique on google_id (issue #234). Postgres treats NULLs as distinct in unique
      // indexes, so local-only accounts may all keep google_id NULL. Migration 003 creates
      // a partial unique index (WHERE google_id IS NOT NULL) for the same logical constraint;
      // force-sync test DBs get this model-level unique index instead.
      // Column name (snake_case): Sequelize does not underscorize index `fields` entries.
      { fields: ['google_id'], unique: true, name: 'users_google_id_unique' }
    ],
    hooks: {
      beforeCreate: setEmailAndPassword,
      beforeUpdate: setEmailAndPassword
    }
  }
);

// Cost factor 12 is the commonly recommended floor for new deployments (issue #207).
// Existing digests (cost 10) still verify via bcrypt.compare; only new hashes use 12.
export const BCRYPT_ROUNDS = 12;

// Precomputed bcrypt hash of a fixed throwaway password at BCRYPT_ROUNDS, used only so
// missing-user / null-digest login paths still burn bcrypt CPU comparable to a real
// compare (issue #240). Never accept a match against this digest as authentication.
// Plaintext was: "timing-dummy-not-a-real-password". If BCRYPT_ROUNDS changes, regenerate:
//   node -e "import('bcryptjs').then(b=>b.hash('timing-dummy-not-a-real-password', ROUNDS).then(console.log))"
export const DUMMY_PASSWORD_DIGEST =
  '$2b$12$Rx6CCkeKMhrGV9RWTZWAduaWbGucrUF9ZD1W2rVYRUkqogrSz/tXW';

/**
 * Constant-work password check (issue #240).
 *
 * Always runs bcrypt.compare against either the real digest or DUMMY_PASSWORD_DIGEST so
 * callers cannot distinguish "no user" / "OAuth-only (null digest)" from "wrong password"
 * by response timing. Returns true only when a real digest was supplied and matched.
 */
export function comparePassword(
  plaintext: string,
  digest: string | null | undefined
): Promise<boolean> {
  const hash = digest || DUMMY_PASSWORD_DIGEST;
  return new Promise((resolve, reject) =>
    bcrypt.compare(plaintext, hash, (err, result) => {
      if (err) return reject(err);
      // Dummy-hash matches must never authenticate.
      resolve(!!digest && !!result);
    })
  );
}

// Sequelize ignores a hook's resolved value (HookReturn is Promise<void>); the mutation of
// `user` is the effect.
function setEmailAndPassword(user: User): Promise<void> {
  user.email = user.email && user.email.toLowerCase();
  const password = user.password;
  if (!password) return Promise.resolve();

  return new Promise((resolve, reject) =>
    bcrypt.hash(password, BCRYPT_ROUNDS, (err, hash) => {
      if (err || hash === undefined) return reject(err ?? new Error('bcrypt produced no hash'));
      user.set('password_digest', hash);
      resolve();
    })
  );
}

export default User;
