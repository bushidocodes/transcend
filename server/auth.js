const auth = require('express').Router();
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

const User = require('../db').model('users');

// Shared with the changeSkin socket event (see server/validSkins.js for why validation
// is required — issue #79).
const VALID_SKINS = require('./validSkins');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(
  (id, done) => {
    User.findByPk(id)
      .then(user => {
        done(null, user);
      })
      .catch(err => {
        done(err);
      });
  }
);

// Local signup. Only the explicitly picked fields reach the model: req.body is fully
// attacker-controlled, and passing it straight to User.create let a signup set ANY column —
// bypassing the VALID_SKINS guard on `skin` (re-opening the injection #79 closed) and
// pre-binding `googleId` to hijack a victim's future Google login (issue #114).
//
// email and password are also required here (issue #139). Without them the model would
// create unusable rows: Sequelize skips isEmail when the field is null, and setEmailAndPassword
// early-returns when password is empty so password_digest stays NULL.
auth.post('/local/signup', (req, res, next) => {
  const { email, password, displayName } = req.body;
  if (!displayName || displayName.length < 1 || displayName.length > 8) {
    return res.status(400).json({ error: 'Display name must be 1–8 characters' });
  }
  // Basic shape only — full isEmail still runs on the model after create. Require `local@domain.tld`
  // (no spaces) so missing/blank emails never reach the DB as NULL. A bare `@` check would let
  // `bad@` through, and the model's isEmail would then reject it via a thrown ValidationError that
  // surfaces as a 500 rather than this clean 400.
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  // Non-empty password so setEmailAndPassword always produces a password_digest. (Google
  // OAuth accounts remain passwordless; this path is local-only.)
  if (typeof password !== 'string' || password.length < 1) {
    return res.status(400).json({ error: 'Password is required' });
  }
  User.create({ email, password, displayName })
    .then(user => {
      req.login(user, (err) => {
        if (err) next(err);
        else res.sendStatus(201);
      });
    })
    .catch(next);
});

// Local login
auth.post('/local/login', (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/api/auth/whoami'
  })(req, res, next);
});

// Local login cont.
passport.use(new LocalStrategy(
  (email, password, done) => {
    User.findOne({ where: { email } })
      .then(user => {
        if (!user) {
          return done(null, false, { message: 'Login incorrect' });
        }
        return user.authenticate(password)
          .then(ok => {
            if (!ok) {
              return done(null, false, { message: 'Login incorrect' });
            }
            done(null, user);
          });
      })
      .catch(done);
  }
));

// Google OAuth
auth.get('/google/login',
  passport.authenticate('google', {
    scope: 'email'
  })
);

// Google OAuth cont.
passport.use(
  new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback'
  },
  // Google will send back the token and profile
  function (token, refreshToken, profile, done) {
    // Google sends back info
    const info = {
      name: profile.displayName,
      email: profile.emails[0].value
    };
      // Put info in db
    User.findOrCreate({
      where: {
        googleId: profile.id
      },
      defaults: info
    })
      .then(([user]) => {
        done(null, user);
      })
      .catch(done);
  })
);

// Google OAuth cont. - handle the callback after Google has authenticated the user
auth.get('/google/callback',
  passport.authenticate('google', {
    successRedirect: '/vr'
  })
);

// Send user info to frontend
auth.get('/whoami', (req, res) => res.send(req.user));

// Persist a skin selection to the user's account
auth.put('/skin', (req, res, next) => {
  if (!req.user) return res.sendStatus(401);
  const { skin } = req.body;
  if (!VALID_SKINS.has(skin)) {
    return res.status(400).json({ error: 'Invalid skin' });
  }
  req.user.update({ skin })
    .then(user => res.json(user))
    .catch(next);
});

auth.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/api/auth/whoami');
  });
});

module.exports = auth;
