/**
 * Unit tests for forceSSL (issue #169).
 *
 * The middleware must never redirect to a host taken from the request Host header —
 * that would be an open redirect. Redirects go only to APP_ORIGIN + req.url.
 */

import type { NextFunction, Request, Response } from 'express';
import { forceSSL } from './force-ssl.ts';

function mockReq(
  overrides: Partial<Request> & { headers?: Record<string, string | undefined> } = {}
): Request {
  const headers = overrides.headers ?? {};
  return {
    headers,
    url: overrides.url ?? '/path?q=1',
    get: (name: string) => {
      if (name.toLowerCase() === 'host') return headers.host ?? headers.Host;
      return headers[name.toLowerCase()];
    },
    ...overrides
  } as unknown as Request;
}

function mockRes(): Response & {
  statusCode?: number;
  body?: string;
  redirectTarget?: string;
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
} {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as string | undefined,
    redirectTarget: undefined as string | undefined,
    status: vi.fn(function (this: typeof res, code: number) {
      this.statusCode = code;
      return this;
    }),
    send: vi.fn(function (this: typeof res, body: string) {
      this.body = body;
      return this;
    }),
    redirect: vi.fn(function (this: typeof res, target: string) {
      this.redirectTarget = target;
      return this;
    })
  };
  return res as unknown as Response & typeof res;
}

describe('forceSSL (issue #169)', () => {
  const originalOrigin = process.env.APP_ORIGIN;

  afterEach(() => {
    if (originalOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = originalOrigin;
  });

  it('calls next() when x-forwarded-proto is https', () => {
    process.env.APP_ORIGIN = 'https://good.com';
    const req = mockReq({ headers: { 'x-forwarded-proto': 'https', host: 'evil.com' } });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    forceSSL(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('redirects to APP_ORIGIN + path, ignoring a spoofed Host header', () => {
    process.env.APP_ORIGIN = 'https://good.com';
    const req = mockReq({
      headers: { 'x-forwarded-proto': 'http', host: 'evil.com' },
      url: '/login?next=/vr'
    });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    forceSSL(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledOnce();
    expect(res.redirectTarget).toBe('https://good.com/login?next=/vr');
    // Critical: never leak the attacker-controlled Host into the Location.
    expect(res.redirectTarget).not.toContain('evil.com');
  });

  it('strips a trailing slash from APP_ORIGIN before joining the path', () => {
    process.env.APP_ORIGIN = 'https://good.com/';
    const req = mockReq({
      headers: { 'x-forwarded-proto': 'http', host: 'evil.com' },
      url: '/api/auth/whoami'
    });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    forceSSL(req, res, next);

    expect(res.redirectTarget).toBe('https://good.com/api/auth/whoami');
  });

  it('fails closed with 500 when APP_ORIGIN is unset (does not use Host)', () => {
    delete process.env.APP_ORIGIN;
    const req = mockReq({
      headers: { 'x-forwarded-proto': 'http', host: 'evil.com' },
      url: '/phish'
    });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    forceSSL(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toMatch(/misconfigured/i);
  });
});
