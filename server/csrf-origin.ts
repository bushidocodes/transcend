/**
 * Lightweight CSRF defence for cookie-authenticated state-changing routes (issue #205).
 *
 * Primary defence is the session cookie's `sameSite: 'lax'` (see server/index.ts): browsers
 * will not attach the cookie on cross-site POST/PUT, which already blocks classic CSRF for
 * cookie-auth mutations. This middleware is defence-in-depth when a browser *does* send an
 * Origin header (typical of CORS/fetch and form POSTs from other sites that opt in).
 *
 * Behaviour:
 *  - No Origin header → allow (non-browser clients, same-origin navigations, curl/tests).
 *  - Origin matches APP_ORIGIN (trailing slash stripped) → allow.
 *  - APP_ORIGIN unset and not production → allow (local dev convenience).
 *  - Otherwise → 403.
 */

import type { NextFunction, Request, Response } from 'express';

/**
 * Normalize an origin URL for comparison: strip trailing slash, keep scheme+host+port.
 */
export function normalizeOrigin (origin: string): string {
  return origin.replace(/\/$/, '');
}

/**
 * Pure check used by the middleware and unit tests.
 * Returns true when the request should be allowed.
 */
export function isSameOriginAllowed (
  originHeader: string | undefined,
  appOrigin: string | undefined,
  nodeEnv: string | undefined
): boolean {
  if (!originHeader) return true;
  const origin = normalizeOrigin(originHeader);
  if (appOrigin) {
    return origin === normalizeOrigin(appOrigin);
  }
  // No configured APP_ORIGIN: only permit outside production so misconfig is not silent.
  return nodeEnv !== 'production';
}

export function requireSameOrigin (req: Request, res: Response, next: NextFunction): void {
  const origin = req.get('Origin');
  if (isSameOriginAllowed(origin, process.env.APP_ORIGIN, process.env.NODE_ENV)) {
    next();
    return;
  }
  res.status(403).json({ error: 'CSRF origin rejected' });
}
