import db, { prepare } from './index.ts';
import User from './models/user.ts';
import { assertSeedAllowed } from './seed-guard.ts';

// Hard-exit before any DB work when this would wipe production (issue #233).
try {
  assertSeedAllowed(process.env);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const seedUsers = () =>
  Promise.all(
    [
      {
        name: 'Omri Bernstein',
        displayName: 'Omri',
        email: 'omri@transcend.vr',
        password: '1234',
        skin: '3djesus'
      },
      {
        name: 'Barack Obama',
        displayName: 'Barack',
        email: 'barack@transcend.vr',
        password: '1234',
        skin: 'agentsmith'
      },
      {
        name: 'Joey Darbyshire',
        displayName: 'Joey',
        email: 'joey@transcend.vr',
        password: '1234',
        skin: 'batman'
      },
      {
        name: 'Sean McBride',
        displayName: 'Sean',
        email: 'sean@transcend.vr',
        password: '1234',
        skin: 'Mario'
      },
      {
        name: 'Yoo-Nah Park',
        displayName: 'Yoo-Nah',
        email: 'yoo-nah@transcend.vr',
        password: '1234',
        skin: 'god'
      },
      {
        name: 'Beth Qiang',
        displayName: 'Beth',
        email: 'beth@transcend.vr',
        password: '1234',
        skin: 'Iron-Man-Minecraft-Skin'
      },
      {
        name: 'Eliot Sfiwbdflkuwsjkdfhweioj',
        displayName: 'Eliot',
        email: 'eliot@transcend.vr',
        password: '1234',
        skin: 'char'
      },
      {
        name: 'Amrom Steinmetz',
        displayName: 'Amrom',
        email: 'amrom@transcend.vr',
        password: '1234',
        skin: 'jetienne'
      },
      {
        name: 'Amy Paschal',
        displayName: 'Amy',
        email: 'amy@transcend.vr',
        password: '1234',
        skin: 'Joker'
      },
      {
        name: 'Andrew Garcia',
        displayName: 'Andrew',
        email: 'andrew@transcend.vr',
        password: '1234',
        skin: 'Mario'
      },
      {
        name: 'Dani YS',
        displayName: 'Dani',
        email: 'dani@transcend.vr',
        password: '1234',
        skin: 'martialartist'
      },
      {
        name: 'Dennis Deng',
        displayName: 'Dennis',
        email: 'dennis@transcend.vr',
        password: '1234',
        skin: 'robocop'
      },
      {
        name: 'Evan DiGiambattista',
        displayName: 'Evan',
        email: 'evan@transcend.vr',
        password: '1234',
        skin: 'Sonicthehedgehog'
      },
      {
        name: 'Joe Cumins',
        displayName: 'Joe',
        email: 'joe@transcend.vr',
        password: '1234',
        skin: 'powerRanger'
      },
      {
        name: 'Mark Hario',
        displayName: 'Mark H.',
        email: 'markh@transcend.vr',
        password: '1234',
        skin: 'Superman'
      },
      {
        name: 'Rachel Bird',
        displayName: 'Rachel',
        email: 'rachel@transcend.vr',
        password: '1234',
        skin: 'theflash'
      },
      {
        name: 'Geoff Bass',
        displayName: 'Geoff',
        email: 'geoff@transcend.vr',
        password: '1234',
        skin: 'woody'
      },
      {
        name: 'Mark Davis',
        displayName: 'Mark D.',
        email: 'markd@transcend.vr',
        password: '1234',
        skin: 'Spiderman'
      },
      {
        name: 'Surabhi Nigam',
        displayName: 'Surabhi',
        email: 'surabhi@transcend.vr',
        password: '1234',
        skin: 'jetienne'
      }
    ].map(user => User.create(user))
  );

// Deliberately destructive dev reset: force-sync drops and recreates the tables from the
// models before inserting the demo users. Never point this at a database you care about.
// The production guard above (assertSeedAllowed) is the enforcement; this comment is the docs.
prepare()
  .then(() => db.sync({ force: true }))
  .then(seedUsers)
  .then(users => console.log(`Seeded ${users.length} users OK`))
  .catch(error => console.error(error))
  .finally(() => db.close());
