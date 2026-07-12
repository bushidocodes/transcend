// MUST stay the first import: reads .env into process.env before the db module (imported
// below, evaluated in order) resolves DATABASE_URL. See load-env.ts.
import './load-env.ts';

import http from 'http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { resolve } from 'path';
import { styleText } from 'node:util';
import helmet from 'helmet';
import passport from 'passport';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Server as SocketIOServer } from 'socket.io';
import db, { connectionUrl, prepare } from '../db/index.ts';
import attachSocketServer from './socket.ts';
import { attachSessionToEngine } from './share-session-with-socket.ts';
import api from './api.ts';
// Open-redirect-safe HTTPS redirect (issue #169): never builds Location from req Host.
import { forceSSL } from './force-ssl.ts';
import { notFound } from './not-found.ts';

const server = http.createServer();
const app = express();

// Security headers (issue #201): hide Express, and apply helmet with a CSP loose enough for
// A-Frame/WebGL (inline scripts/styles, data/blob images, WebSocket connect).
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      mediaSrc: ["'self'", 'blob:'],
      workerSrc: ["'self'", 'blob:'],
      // A-Frame may create child frames / WebXR layers; allow same-origin only.
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  // crossOriginEmbedderPolicy blocks some A-Frame/WebGL asset patterns; leave off.
  crossOriginEmbedderPolicy: false
}));

if (process.env.NODE_ENV === 'production') {
  console.log(styleText('blue', 'Production Environment detected, so redirect to HTTPS'));
  // TLS terminates at the platform's proxy/ELB; trust X-Forwarded-* so express sees the
  // original protocol — forceSSL reads it, and the session cookie's `secure` flag needs it.
  app.set('trust proxy', 1);
  app.use(forceSSL);
}

if (process.env.NODE_ENV !== 'production') {
  // Logging middleware (dev only). Dynamic import keeps morgan a devDependency-only load,
  // like the conditional require() it replaces.
  const { default: morgan } = await import('morgan');
  app.use(morgan('dev'));
}

// Set up session middleware. The secret signs the session cookie, so a known/guessable
// value lets anyone forge a session for any user (full auth bypass). Require it in
// production and refuse to boot otherwise; in dev/test fall back to a throwaway key but
// warn loudly so the insecure state is never silent (issue #78).
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (process.env.NODE_ENV === 'production') {
    console.error(styleText('red', 'FATAL: SESSION_SECRET is required in production. Generate one with `openssl rand -hex 32`.'));
    process.exit(1);
  }
  console.warn(styleText('yellow', 'WARNING: SESSION_SECRET is not set — using an insecure development fallback. Set it before deploying (e.g. `openssl rand -hex 32`).'));
}
// Server-side sessions (issue #122): express-session + a Postgres store replace
// cookie-session. The whole session used to live in a signed client cookie, which meant no
// server-side revocation (a stolen or replaced session couldn't be invalidated) and no real
// regenerate()/save() — a hand-written shim no-op'd exactly the calls Passport 0.6+ makes to
// prevent session fixation. Now only the session id travels in the cookie, the data lives in
// Postgres (a `session` table, auto-created; expired rows are pruned by the store), Passport's
// regenerate() genuinely rotates the id on login, and deleting a row revokes that session.
const PgSessionStore = connectPgSimple(session);
// Named middleware so the same session instance can be shared with socket.io (issue #167):
// Engine.IO runs this on the handshake request, so Passport can populate socket.request.user
// and joinScene can trust accountId from the session instead of the client payload.
const sessionMiddleware = session({
  store: new PgSessionStore({
    conString: connectionUrl,
    createTableIfMissing: true
  }),
  name: 'session',
  secret: sessionSecret || 'insecure-dev-only-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // sameSite: 'lax' is the primary CSRF mitigation for cookie-auth mutations (issue #205).
    // Browsers will not attach this session cookie on cross-site POST/PUT (only on top-level
    // GET navigations), so classic CSRF against /api/auth/* cannot ride a logged-in session.
    // Defence-in-depth: requireSameOrigin on state-changing auth routes also rejects a present
    // but mismatched Origin header (see server/csrf-origin.ts).
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
});
app.use(sessionMiddleware);

// Body parsing middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Authentication middleware (same instances shared with socket.io below)
const passportInit = passport.initialize();
const passportSession = passport.session();
app.use(passportInit);
app.use(passportSession);

// Setting up socket.io
server.on('request', app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.APP_ORIGIN ||
            (process.env.NODE_ENV === 'production' ? false : '*')
  }
});
// Share Express session + Passport with Engine.IO so socket handlers can read the
// authenticated user off socket.request (issue #167). express-session and passport
// middleware accept the (req, res, next) Engine.IO signature.
attachSessionToEngine(io, sessionMiddleware, passportInit, passportSession);
attachSocketServer(io);

// Serve static files
app.use(express.static(resolve(import.meta.dirname, '../browser/stylesheets')));
app.use(express.static(resolve(import.meta.dirname, '../public')));

// Readiness probe (issue #121): 200 only when the database is reachable, so a load balancer /
// container orchestrator can tell a booting-or-broken instance from a healthy one.
//
// The probe is unauthenticated, so it must not cost a DB round-trip per request — otherwise
// anyone can burn pool connections by hammering it (flagged by CodeQL on PR #134). Coalesce
// and cache the check instead: at most one authenticate() (a trivial SELECT) is in flight or
// cached per TTL window no matter the request volume, and a 2s-stale answer is well within
// any orchestrator's probe tolerance. This bounds DB work globally, which per-IP rate
// limiting wouldn't.
const HEALTH_TTL_MS = 2000;
let dbHealth: { at: number, promise: Promise<boolean> | null } = { at: -Infinity, promise: null };
function checkDbHealth (): Promise<boolean> {
  if (Date.now() - dbHealth.at > HEALTH_TTL_MS) {
    dbHealth = {
      at: Date.now(),
      promise: db.authenticate().then(() => true, () => false)
    };
  }
  return dbHealth.promise!;
}
app.get('/healthz', (req, res) => {
  checkDbHealth().then(healthy => {
    if (healthy) res.status(200).json({ status: 'ok' });
    else res.status(503).json({ status: 'unavailable' });
  });
});

// Routes
app.use('/api', api);

// Send index.html for anything else
app.get('/{*path}', (req, res) => {
  res.sendFile('app.html', { root: resolve(import.meta.dirname, '../browser') });
});

// Unmatched non-GET methods would otherwise hang with no response. Answer them with 404
// before the error middleware below (which expects 4 args and only runs on errors).
app.use(notFound);

const port = process.env.PORT || 1337;
// Don't accept traffic until the database is confirmed ready (issue #121): prepare() runs
// pending migrations (#133) and resolves only once the schema is usable. On failure, exit
// non-zero instead of leaving a permanently broken instance up throwing on every request.
prepare()
  .then(() => {
    server.listen(port, () => {
      console.log(styleText('blue', `--- Listening on port ${port} ---`));
    });
  })
  .catch(err => {
    // Sequelize connection errors often have an empty .message; the class name is the signal.
    console.error(styleText('red', `FATAL: database unreachable at boot — ${err.message || err.name || err}`));
    process.exit(1);
  });

// Graceful shutdown (issue #121): stop accepting connections, disconnect every socket.io
// client, drain in-flight HTTP requests, close the Sequelize pool, then exit 0 — with a
// watchdog that force-exits non-zero if draining hangs. io.close() both disconnects the
// sockets and closes the attached HTTP server; idle keep-alive connections would stall that
// close, so they're dropped explicitly. (Windows can't deliver SIGTERM to a process — these
// handlers run on POSIX deploys, where orchestrators send it.)
let shuttingDown = false;
function shutdown (signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(styleText('blue', `${signal} received — shutting down`));
  const watchdog = setTimeout(() => {
    console.error(styleText('red', 'Shutdown timed out; forcing exit'));
    process.exit(1);
  }, 10000);
  watchdog.unref();
  io.close(() => {
    db.close()
      .catch(() => {})
      .then(() => {
        console.log(styleText('blue', 'Shutdown complete'));
        process.exit(0);
      });
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

app.use('/', (err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
  console.log(styleText('red', 'Houston, we have a problem'));
  console.log(styleText('red', `ERROR: ${err.message}`));
  res.sendStatus(err.status || 500);
});
