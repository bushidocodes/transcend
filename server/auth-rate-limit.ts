/**
 * Rate limiters for local auth (issue #140) and PUT /skin (issue #203).
 *
 * Login and signup used to accept unlimited attempts — brute-force / credential stuffing
 * plus cheap bcrypt-CPU DoS. Limits are intentionally generous for a shared-NAT classroom
 * (many students behind one school IP) while still cutting unbounded sprays.
 *
 * PUT /skin writes to the DB on every hit; a dedicated per-IP limiter caps unbounded sprays
 * without sharing the login/signup budget (issue #203).
 *
 * Defaults (overridable via env for ops / tests):
 *   AUTH_RATE_LIMIT_WINDOW_MS          — window length (default 15 minutes)
 *   AUTH_RATE_LIMIT_IP_MAX             — max login+signup hits per IP per window (default 60)
 *   AUTH_LOGIN_EMAIL_RATE_LIMIT_MAX    — max login hits per email per window (default 20)
 *   SKIN_RATE_LIMIT_WINDOW_MS          — skin PUT window (default 1 minute)
 *   SKIN_RATE_LIMIT_IP_MAX             — max skin PUTs per IP per window (default 30)
 */

import { rateLimit, ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';

function envInt (name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface AuthRateLimiterOverrides {
  windowMs?: number;
  ipMax?: number;
  loginEmailMax?: number;
  skinWindowMs?: number;
  skinIpMax?: number;
}

export interface AuthRateLimiters {
  ipLimiter: RateLimitRequestHandler;
  loginEmailLimiter: RateLimitRequestHandler;
  skinLimiter: RateLimitRequestHandler;
  windowMs: number;
  ipMax: number;
  loginEmailMax: number;
  skinWindowMs: number;
  skinIpMax: number;
}

export function createAuthRateLimiters (overrides: AuthRateLimiterOverrides = {}): AuthRateLimiters {
  const windowMs = overrides.windowMs ?? envInt('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
  const ipMax = overrides.ipMax ?? envInt('AUTH_RATE_LIMIT_IP_MAX', 60);
  const loginEmailMax = overrides.loginEmailMax ?? envInt('AUTH_LOGIN_EMAIL_RATE_LIMIT_MAX', 20);
  // Generous for classroom skin browsing (30/min per IP) while blocking unbounded DB writes.
  const skinWindowMs = overrides.skinWindowMs ?? envInt('SKIN_RATE_LIMIT_WINDOW_MS', 60 * 1000);
  const skinIpMax = overrides.skinIpMax ?? envInt('SKIN_RATE_LIMIT_IP_MAX', 30);

  // Shared by /local/login and /local/signup — caps total auth-mutation traffic per source IP.
  const ipLimiter = rateLimit({
    windowMs,
    limit: ipMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts, please try again later' }
  });

  // Stricter per-account key on login so credential stuffing the same email across many IPs
  // still hits a ceiling. Passport-local reads `username`; accept `email` as an alias.
  const loginEmailLimiter = rateLimit({
    windowMs,
    limit: loginEmailMax,
    standardHeaders: true,
    legacyHeaders: false,
    // Custom key is the account identifier, not the IP — disable the "must use IP" validation.
    validate: { keyGeneratorIpFallback: false },
    keyGenerator: (req) => {
      const raw = (req.body && (req.body.username || req.body.email)) || '';
      const email = String(raw).toLowerCase().trim();
      if (email) return `login-email:${email}`;
      // No identity in the body — fall back to IP so the request still counts.
      return `login-ip:${ipKeyGenerator(req.ip ?? '')}`;
    },
    message: { error: 'Too many login attempts for this account, please try again later' }
  });

  // PUT /skin — per-IP only (authenticated route; issue #203).
  const skinLimiter = rateLimit({
    windowMs: skinWindowMs,
    limit: skinIpMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many skin changes, please try again later' }
  });

  return {
    ipLimiter,
    loginEmailLimiter,
    skinLimiter,
    windowMs,
    ipMax,
    loginEmailMax,
    skinWindowMs,
    skinIpMax
  };
}
