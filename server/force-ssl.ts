/**
 * HTTP → HTTPS redirect for production (behind a TLS-terminating proxy).
 *
 * The old implementation built the redirect target from req.get('Host'), which is
 * client-controlled. A request with `Host: evil.com` would 302 to https://evil.com/...
 * — an open redirect usable for phishing (issue #169).
 *
 * Redirect against the configured APP_ORIGIN instead. Fail closed if it's unset.
 */

import { styleText } from 'node:util';
import type { NextFunction, Request, Response } from 'express';

export function forceSSL(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-forwarded-proto'] === 'https') {
    next();
    return;
  }

  const origin = process.env.APP_ORIGIN;
  if (!origin) {
    // Fail closed — do not fall back to the Host header (that is the open-redirect bug).
    console.error('APP_ORIGIN required for HTTPS redirect');
    res.status(500).send('Misconfigured redirect');
    return;
  }

  const base = origin.replace(/\/$/, '');
  const redirectTarget = base + req.url;
  const clientIP = req.headers['x-forwarded-for'];
  console.log(styleText('blue', `Redirecting ${clientIP} to ${redirectTarget}`));
  res.redirect(redirectTarget);
}
