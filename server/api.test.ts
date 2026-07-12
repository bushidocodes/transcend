/**
 * Route-level tests for GET /api/ice-servers (issue #175).
 *
 * The endpoint is auth-gated: anonymous callers get 401; authenticated callers receive at
 * least a STUN entry. User model is mocked so no database is required (same pattern as
 * server/auth.test.ts).
 */

import type http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';

const mockUser = vi.hoisted(() => {
  process.env.CLIENT_ID = process.env.CLIENT_ID || 'dummy-client-id';
  process.env.CLIENT_SECRET = process.env.CLIENT_SECRET || 'dummy-client-secret';
  return {
    create: vi.fn(),
    findByPk: vi.fn(),
    findOne: vi.fn(),
    findOrCreate: vi.fn()
  };
});

vi.mock('../db/models/user.ts', () => ({ default: mockUser, User: mockUser }));

// Import after the mock so api → auth → User resolves to the stub.
const { default: api } = await import('./api.ts');

let server: http.Server;
let baseUrl: string;
// When true, middleware attaches a fake logged-in user on the request.
let attachUser = false;

beforeAll(() => new Promise<void>(resolve => {
  const app = express();
  app.use((req, _res, next) => {
    if (attachUser) {
      // Minimal stand-in — ice-servers only checks truthiness of req.user. Cast past the
      // passport/User model augmentation so tsc accepts a stub without a full Sequelize row.
      req.user = { id: 1 } as unknown as Express.User;
    }
    next();
  });
  app.use(api);
  server = app.listen(0, () => {
    baseUrl = 'http://localhost:' + (server.address() as AddressInfo).port;
    resolve();
  });
}));

afterAll(() => new Promise(resolve => server.close(resolve)));

beforeEach(() => {
  attachUser = false;
  // Isolate env so STUN default / TURN branches are deterministic.
  delete process.env.STUN_URL;
  delete process.env.TURN_URL;
  delete process.env.TURN_STATIC_AUTH_SECRET;
  delete process.env.TURN_USERNAME;
  delete process.env.TURN_CREDENTIAL;
});

describe('GET /ice-servers (issue #175)', () => {
  it('returns 401 when no user is authenticated', async () => {
    const res = await fetch(baseUrl + '/ice-servers');
    expect(res.status).toBe(401);
  });

  it('returns a STUN entry when the user is authenticated', async () => {
    attachUser = true;
    const res = await fetch(baseUrl + '/ice-servers');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.iceServers).toEqual([
      { urls: 'stun:stun.l.google.com:19302' }
    ]);
  });

  it('uses STUN_URL when set', async () => {
    attachUser = true;
    process.env.STUN_URL = 'stun:custom.example:3478';
    const res = await fetch(baseUrl + '/ice-servers');
    const body = await res.json();
    expect(body.iceServers[0].urls).toBe('stun:custom.example:3478');
  });
});
