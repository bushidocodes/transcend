/**
 * Rate-limit coverage for local auth (issue #140).
 *
 * Uses the factory with a tiny limit so we don't wait on the production 15-minute window.
 * The real auth router is not loaded here — that would pull passport-google-oauth + the
 * User model; we only assert the middleware returns 429 after the configured max hits.
 */

import type http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { createAuthRateLimiters, type AuthRateLimiters } from './auth-rate-limit.ts';

let server: http.Server;
let baseUrl: string;
let ipLimiter: AuthRateLimiters['ipLimiter'];
let loginEmailLimiter: AuthRateLimiters['loginEmailLimiter'];

beforeAll(() => new Promise<void>(resolve => {
  ({ ipLimiter, loginEmailLimiter } = createAuthRateLimiters({
    windowMs: 60 * 1000,
    ipMax: 3,
    loginEmailMax: 2
  }));

  const app = express();
  app.use(express.json());
  app.post('/signup', ipLimiter, (req, res) => res.sendStatus(201));
  app.post('/login', ipLimiter, loginEmailLimiter, (req, res) => res.sendStatus(401));

  server = app.listen(0, () => {
    baseUrl = 'http://localhost:' + (server.address() as AddressInfo).port;
    resolve();
  });
}));

afterAll(() => new Promise(resolve => server.close(resolve)));

async function post (path: string, body?: Record<string, unknown>) {
  return fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
}

describe('auth IP rate limit (issue #140)', function () {
  it('returns 429 after the per-IP max on signup', async function () {
    // Three allowed, then blocked. Paths share the same ipLimiter instance.
    expect((await post('/signup', { email: 'a@b.com' })).status).toBe(201);
    expect((await post('/signup', { email: 'b@b.com' })).status).toBe(201);
    expect((await post('/signup', { email: 'c@b.com' })).status).toBe(201);
    const blocked = await post('/signup', { email: 'd@b.com' });
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toMatch(/too many/i);
  });
});

describe('skin PUT rate limit (issue #203)', function () {
  let skinServer: http.Server;
  let skinBase: string;

  beforeAll(() => new Promise<void>(resolve => {
    const limiters = createAuthRateLimiters({
      windowMs: 60 * 1000,
      ipMax: 100,
      loginEmailMax: 100,
      skinWindowMs: 60 * 1000,
      skinIpMax: 3
    });
    const app = express();
    app.use(express.json());
    app.put('/skin', limiters.skinLimiter, (req, res) => res.sendStatus(200));
    skinServer = app.listen(0, () => {
      skinBase = 'http://localhost:' + (skinServer.address() as AddressInfo).port;
      resolve();
    });
  }));

  afterAll(() => new Promise(resolve => skinServer.close(resolve)));

  it('returns 429 after the per-IP max on PUT /skin', async function () {
    const hit = () => fetch(skinBase + '/skin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skin: 'batman' })
    });

    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(200);
    const blocked = await hit();
    expect(blocked.status).toBe(429);
    const json = await blocked.json();
    expect(json.error).toMatch(/too many skin/i);
  });
});

describe('auth login email rate limit (issue #140)', function () {
  // Fresh limiters so the previous describe's IP hits don't pollute this one.
  let emailServer: http.Server;
  let emailBase: string;

  beforeAll(() => new Promise<void>(resolve => {
    const limiters = createAuthRateLimiters({
      windowMs: 60 * 1000,
      ipMax: 100,
      loginEmailMax: 2
    });
    const app = express();
    app.use(express.json());
    app.post('/login', limiters.ipLimiter, limiters.loginEmailLimiter, (req, res) => {
      res.sendStatus(401);
    });
    emailServer = app.listen(0, () => {
      emailBase = 'http://localhost:' + (emailServer.address() as AddressInfo).port;
      resolve();
    });
  }));

  afterAll(() => new Promise(resolve => emailServer.close(resolve)));

  it('returns 429 after the per-email max on login', async function () {
    const body = { username: 'victim@example.com', password: 'guess' };
    const hit = () => fetch(emailBase + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    expect((await hit()).status).toBe(401);
    expect((await hit()).status).toBe(401);
    const blocked = await hit();
    expect(blocked.status).toBe(429);
    const json = await blocked.json();
    expect(json.error).toMatch(/too many login attempts/i);
  });

  it('tracks different emails independently', async function () {
    // victim@ is already exhausted above; a different account should still get through.
    const res = await fetch(emailBase + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'other@example.com', password: 'guess' })
    });
    expect(res.status).toBe(401);
  });
});
