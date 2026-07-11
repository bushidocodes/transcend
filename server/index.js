// Load environment variables from a .env file if present, using Node's built-in loader
// (replaces the `dotenv` dep). Like dotenv, this does not override variables already set
// in the environment, so an inline `DATABASE_URL=… node server/index.js` still wins.
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the real environment.
}
const http = require('http');
const server = http.createServer();
const express = require('express');
const app = express();
const { resolve } = require('path');
const { styleText } = require('node:util');
const passport = require('passport');
const db = require('../db');

// Custom Middleware to redirect HTTP to https using request headers appended
// By one of Heroku's AWS ELB instances.
// http://docs.aws.amazon.com/elasticloadbalancing/latest/classic/x-forwarded-headers.html
// Note that this is technically vulnerable to man-in-the-middle attacks
const forceSSL = function (req, res, next) {
  if (req.headers['x-forwarded-proto'] !== 'https') {
    const clientIP = req.headers['x-forwarded-for'];
    const redirectTarget = ['https://', req.get('Host'), req.url].join('');
    console.log(styleText('blue', `Redirecting ${clientIP} to ${redirectTarget}`));
    return res.redirect(redirectTarget);
  }
  return next();
};

if (process.env.NODE_ENV === 'production') {
  console.log(styleText('blue', 'Production Environment detected, so redirect to HTTPS'));
  // TLS terminates at the platform's proxy/ELB; trust X-Forwarded-* so express sees the
  // original protocol — forceSSL reads it, and the session cookie's `secure` flag needs it.
  app.set('trust proxy', 1);
  app.use(forceSSL);
}

if (process.env.NODE_ENV !== 'production') {
  // Logging middleware (dev only)
  const morgan = require('morgan');
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
const session = require('express-session');
const PgSessionStore = require('connect-pg-simple')(session);
app.use(session({
  store: new PgSessionStore({
    conString: db.connectionUrl,
    createTableIfMissing: true
  }),
  name: 'session',
  secret: sessionSecret || 'insecure-dev-only-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// Body parsing middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Authentication middleware
app.use(passport.initialize());
app.use(passport.session());

// Setting up socket.io
const { Server: SocketIOServer } = require('socket.io');
server.on('request', app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.APP_ORIGIN ||
            (process.env.NODE_ENV === 'production' ? false : '*')
  }
});
require('./socket')(io);

// Serve static files
app.use(express.static(resolve(__dirname, '../browser/stylesheets')));
app.use(express.static(resolve(__dirname, '../public')));

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
let dbHealth = { at: -Infinity, promise: null };
function checkDbHealth () {
  if (Date.now() - dbHealth.at > HEALTH_TTL_MS) {
    dbHealth = {
      at: Date.now(),
      promise: db.authenticate().then(() => true, () => false)
    };
  }
  return dbHealth.promise;
}
app.get('/healthz', (req, res) => {
  checkDbHealth().then(healthy => {
    if (healthy) res.status(200).json({ status: 'ok' });
    else res.status(503).json({ status: 'unavailable' });
  });
});

// Routes
app.use('/api', require('./api'));

// Send index.html for anything else
app.get('/{*path}', (req, res) => {
  res.sendFile('app.html', { root: resolve(__dirname, '../browser') });
});

const port = process.env.PORT || 1337;
// Don't accept traffic until the database is confirmed ready (issue #121): prepare() runs
// pending migrations (#133) and resolves only once the schema is usable. On failure, exit
// non-zero instead of leaving a permanently broken instance up throwing on every request.
db.prepare()
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
function shutdown (signal) {
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

app.use('/', (err, req, res, next) => {
  console.log(styleText('red', 'Houston, we have a problem'));
  console.log(styleText('red', `ERROR: ${err.message}`));
  res.sendStatus(err.status || 500);
});
