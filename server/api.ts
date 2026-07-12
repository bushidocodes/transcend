import crypto from 'crypto';
import express from 'express';
import auth from './auth.ts';

const api = express.Router();

api.use('/auth', auth);

// Returns the WebRTC ICE server list. TURN credentials are minted per request instead of
// shipped as a static secret (issue #83):
//   - if TURN_STATIC_AUTH_SECRET is set, generate short-lived coturn "TURN REST API"
//     credentials (use-auth-secret) — username is an expiry timestamp and the credential is
//     base64(HMAC-SHA1(secret, username)), so a scraped credential stops working on its own;
//   - otherwise fall back to the static TURN_USERNAME/TURN_CREDENTIAL pair (compatible with
//     #81) so existing deployments keep working;
//   - with no TURN_URL at all, return STUN only.
// Gated behind auth: only logged-in users ever need ICE servers (you must be in a room to
// peer), so anonymous callers can't mint or relay credentials.
api.get('/ice-servers', (req, res) => {
  if (!req.user) return res.sendStatus(401);

  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: process.env.STUN_URL || 'stun:stun.l.google.com:19302' }
  ];

  if (process.env.TURN_URL) {
    if (process.env.TURN_STATIC_AUTH_SECRET) {
      const ttl = Number(process.env.TURN_TTL_SECONDS) || 3600;
      const username = String(Math.floor(Date.now() / 1000) + ttl);
      const credential = crypto
        .createHmac('sha1', process.env.TURN_STATIC_AUTH_SECRET)
        .update(username)
        .digest('base64');
      iceServers.push({ urls: process.env.TURN_URL, username, credential });
    } else {
      iceServers.push({
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL
      });
    }
  }

  res.json({ iceServers });
});

// No routes matched? 404.
api.use((_req, res) => res.status(404).end());

export default api;
