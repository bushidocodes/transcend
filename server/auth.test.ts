/**
 * Route-level tests for the auth router's local signup (issue #114).
 *
 * POST /local/signup used to pass the raw request body straight to User.create, so a signup
 * could set ANY column on the users model: `skin` (bypassing the VALID_SKINS guard — the
 * injection #79 closed), `googleId` (pre-binding a victim's Google id so their next Google
 * sign-in resolves to the attacker's account), `password_digest`, etc. The route must pick
 * exactly { email, password, displayName } and ignore everything else.
 *
 * The User model module is mocked so no database is required: we assert on what reaches the
 * model. (The old CommonJS version had to seed require.cache by hand because Node's own
 * require bypassed vi.mock; as ESM through Vite's transform, vi.mock just works. Actually
 * importing the model would open a connection and force-sync the test database, racing
 * db/models/user.test.ts in a parallel worker.)
 */

import type http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import auth from './auth.ts';

// vi.hoisted runs before the (also hoisted) vi.mock factory and before any static import
// executes: the mock needs mockUser, and passport-google-oauth20's strategy constructor (run
// at module load of ./auth.ts) throws without a clientID, so the dummies must be in place
// before the router loads.
const mockUser = vi.hoisted(() => {
  process.env.CLIENT_ID = process.env.CLIENT_ID || 'dummy-client-id';
  process.env.CLIENT_SECRET = process.env.CLIENT_SECRET || 'dummy-client-secret';
  return {
    create: vi.fn((attrs: Record<string, unknown>) => Promise.resolve(Object.assign({ id: 1 }, attrs))),
    findByPk: vi.fn(),
    findOne: vi.fn(),
    findOrCreate: vi.fn()
  };
});

vi.mock('../db/models/user.ts', () => ({ default: mockUser, User: mockUser }));

let server: http.Server;
let baseUrl: string;

beforeAll(() => new Promise<void>(resolve => {
  const app = express();
  app.use(express.json());
  // The real app establishes req.login via passport.initialize()/session(); the signup
  // handler only needs it to exist and succeed, so stub it rather than standing up
  // express-session + passport middleware here.
  app.use((req, res, next) => {
    req.login = ((user: unknown, cb: (err?: unknown) => void) => cb()) as typeof req.login;
    next();
  });
  app.use(auth);
  server = app.listen(0, () => {
    baseUrl = 'http://localhost:' + (server.address() as AddressInfo).port;
    resolve();
  });
}));

afterAll(() => new Promise(resolve => server.close(resolve)));

beforeEach(() => {
  mockUser.create.mockClear();
});

function signup (body: Record<string, unknown>) {
  return fetch(baseUrl + '/local/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('POST /local/signup – mass assignment guard (issue #114)', function () {
  it('creates the user from exactly { email, password, displayName }', async function () {
    const res = await signup({
      email: 'alice@example.com',
      password: 'secret123',
      displayName: 'Alice'
    });
    expect(res.status).toBe(201);
    expect(mockUser.create).toHaveBeenCalledTimes(1);
    expect(mockUser.create).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'secret123',
      displayName: 'Alice'
    });
  });

  it('ignores skin, googleId, password_digest, and any other extra fields', async function () {
    const res = await signup({
      email: 'mallory@example.com',
      password: 'secret123',
      displayName: 'Mallory',
      // Everything below must never reach the model:
      skin: '../../evil; component: injected',   // re-opens the #79 injection via signup
      googleId: 'victim-google-id-12345',        // account pre-binding / takeover primitive
      password_digest: '$2a$10$attackerchosen',  // forged credential material
      name: 'admin',
      id: 9999
    });
    expect(res.status).toBe(201);
    expect(mockUser.create).toHaveBeenCalledTimes(1);
    expect(mockUser.create).toHaveBeenCalledWith({
      email: 'mallory@example.com',
      password: 'secret123',
      displayName: 'Mallory'
    });
  });

  it('still rejects a missing or over-long displayName', async function () {
    const missing = await signup({ email: 'a@b.com', password: 'x' });
    expect(missing.status).toBe(400);
    const tooLong = await signup({ email: 'a@b.com', password: 'x', displayName: 'waytoolongname' });
    expect(tooLong.status).toBe(400);
    expect(mockUser.create).not.toHaveBeenCalled();
  });
});

describe('POST /local/signup – email and password required (issue #139)', function () {
  it('rejects a missing email', async function () {
    const res = await signup({ password: 'secret', displayName: 'NoMail' });
    expect(res.status).toBe(400);
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it('rejects a blank or non-email email', async function () {
    const blank = await signup({ email: '   ', password: 'secret', displayName: 'Blank' });
    expect(blank.status).toBe(400);
    const noAt = await signup({ email: 'not-an-email', password: 'secret', displayName: 'NoAt' });
    expect(noAt.status).toBe(400);
    // Has an @ but no domain/TLD — the route must catch this (400) rather than letting the
    // model's isEmail throw a ValidationError that would surface as a 500.
    const noDomain = await signup({ email: 'bad@', password: 'secret', displayName: 'NoDom' });
    expect(noDomain.status).toBe(400);
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it('accepts a well-formed email and password', async function () {
    const res = await signup({ email: 'valid@example.com', password: 'secret', displayName: 'Valid' });
    expect(res.status).toBe(201);
    expect(mockUser.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing or empty password', async function () {
    const missing = await signup({ email: 'x@example.com', displayName: 'NoPass' });
    expect(missing.status).toBe(400);
    const empty = await signup({ email: 'x@example.com', password: '', displayName: 'NoPass' });
    expect(empty.status).toBe(400);
    expect(mockUser.create).not.toHaveBeenCalled();
  });
});
