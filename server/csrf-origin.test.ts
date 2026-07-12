/**
 * Unit tests for requireSameOrigin / isSameOriginAllowed (issue #205).
 */

import type { NextFunction, Request, Response } from 'express';
import {
  isSameOriginAllowed,
  normalizeOrigin,
  requireSameOrigin
} from './csrf-origin.ts';

describe('normalizeOrigin', () => {
  it('strips a trailing slash', () => {
    expect(normalizeOrigin('https://app.example.com/')).toBe('https://app.example.com');
  });

  it('leaves origins without a trailing slash unchanged', () => {
    expect(normalizeOrigin('https://app.example.com')).toBe('https://app.example.com');
  });
});

describe('isSameOriginAllowed (issue #205)', () => {
  it('allows when Origin is absent (non-browser / same-origin navigations)', () => {
    expect(isSameOriginAllowed(undefined, 'https://app.example.com', 'production')).toBe(true);
  });

  it('allows when Origin matches APP_ORIGIN', () => {
    expect(isSameOriginAllowed(
      'https://app.example.com',
      'https://app.example.com',
      'production'
    )).toBe(true);
  });

  it('allows when Origin matches APP_ORIGIN ignoring trailing slash', () => {
    expect(isSameOriginAllowed(
      'https://app.example.com',
      'https://app.example.com/',
      'production'
    )).toBe(true);
    expect(isSameOriginAllowed(
      'https://app.example.com/',
      'https://app.example.com',
      'production'
    )).toBe(true);
  });

  it('rejects a cross-site Origin when APP_ORIGIN is set', () => {
    expect(isSameOriginAllowed(
      'https://evil.example',
      'https://app.example.com',
      'production'
    )).toBe(false);
  });

  it('allows any Origin in non-production when APP_ORIGIN is unset', () => {
    expect(isSameOriginAllowed('https://evil.example', undefined, 'development')).toBe(true);
    expect(isSameOriginAllowed('https://evil.example', undefined, 'test')).toBe(true);
  });

  it('rejects any Origin in production when APP_ORIGIN is unset', () => {
    expect(isSameOriginAllowed('https://evil.example', undefined, 'production')).toBe(false);
  });
});

describe('requireSameOrigin middleware', () => {
  const originalOrigin = process.env.APP_ORIGIN;
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = originalOrigin;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });

  function mockReq (origin?: string): Request {
    return {
      get: (name: string) => (name.toLowerCase() === 'origin' ? origin : undefined)
    } as unknown as Request;
  }

  function mockRes (): Response & {
    statusCode?: number;
    body?: unknown;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  } {
    const res = {
      statusCode: undefined as number | undefined,
      body: undefined as unknown,
      status: vi.fn(function (this: typeof res, code: number) {
        this.statusCode = code;
        return this;
      }),
      json: vi.fn(function (this: typeof res, body: unknown) {
        this.body = body;
        return this;
      })
    };
    return res as unknown as Response & typeof res;
  }

  it('calls next() for matching Origin', () => {
    process.env.APP_ORIGIN = 'https://app.example.com';
    process.env.NODE_ENV = 'production';
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireSameOrigin(mockReq('https://app.example.com'), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 for mismatched Origin', () => {
    process.env.APP_ORIGIN = 'https://app.example.com';
    process.env.NODE_ENV = 'production';
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireSameOrigin(mockReq('https://evil.example'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toEqual({ error: 'CSRF origin rejected' });
  });

  it('calls next() when Origin is missing', () => {
    process.env.APP_ORIGIN = 'https://app.example.com';
    process.env.NODE_ENV = 'production';
    const next = vi.fn() as NextFunction;
    const res = mockRes();
    requireSameOrigin(mockReq(undefined), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
