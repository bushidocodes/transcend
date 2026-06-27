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
app.use(require('cookie-session')({
  name: 'session',
  keys: [sessionSecret || 'insecure-dev-only-secret']
}));

// Shim for passport 0.6+ compatibility with cookie-session (which lacks regenerate/save)
app.use((req, res, next) => {
  if (req.session && !req.session.regenerate) {
    req.session.regenerate = (cb) => { cb(); };
  }
  if (req.session && !req.session.save) {
    req.session.save = (cb) => { cb(); };
  }
  next();
});

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
app.use(express.static(resolve(__dirname, '../node_modules/font-awesome')));

// Routes
app.use('/api', require('./api'));

// Send index.html for anything else
app.get('/{*path}', (req, res) => {
  res.sendFile('app.html', { root: resolve(__dirname, '../browser') });
});

const port = process.env.PORT || 1337;
server.listen(port, () => {
  console.log(styleText('blue', `--- Listening on port ${port} ---`));
});

app.use('/', (err, req, res, next) => {
  console.log(styleText('red', 'Houston, we have a problem'));
  console.log(styleText('red', `ERROR: ${err.message}`));
  res.sendStatus(err.status || 500);
});
