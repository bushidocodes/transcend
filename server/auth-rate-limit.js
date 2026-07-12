'use strict';

/**
 * Rate limiters for local auth (issue #140).
 *
 * Login and signup used to accept unlimited attempts — brute-force / credential stuffing
 * plus cheap bcrypt-CPU DoS. Limits are intentionally generous for a shared-NAT classroom
 * (many students behind one school IP) while still cutting unbounded sprays.
 *
 * Defaults (overridable via env for ops / tests):
 *   AUTH_RATE_LIMIT_WINDOW_MS          — window length (default 15 minutes)
 *   AUTH_RATE_LIMIT_IP_MAX             — max login+signup hits per IP per window (default 60)
 *   AUTH_LOGIN_EMAIL_RATE_LIMIT_MAX    — max login hits per email per window (default 20)
 */

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

function envInt (name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function createAuthRateLimiters (overrides = {}) {
  const windowMs = overrides.windowMs ?? envInt('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
  const ipMax = overrides.ipMax ?? envInt('AUTH_RATE_LIMIT_IP_MAX', 60);
  const loginEmailMax = overrides.loginEmailMax ?? envInt('AUTH_LOGIN_EMAIL_RATE_LIMIT_MAX', 20);

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
      return `login-ip:${ipKeyGenerator(req.ip)}`;
    },
    message: { error: 'Too many login attempts for this account, please try again later' }
  });

  return { ipLimiter, loginEmailLimiter, windowMs, ipMax, loginEmailMax };
}

module.exports = { createAuthRateLimiters };
