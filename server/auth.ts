import express from 'express';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
// passport-google-oauth is a deprecated meta-package (last published 2022). Use the
// maintained OAuth 2.0 strategy directly (issue #152).
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

import User from '../db/models/user.ts';

// Shared with the changeSkin socket event (see server/validSkins.ts for why validation
// is required — issue #79).
import VALID_SKINS from './validSkins.ts';

// Throttle local signup/login (issue #140). whoami / logout / skin / Google OAuth stay
// unlimited — they are not online password-guessing surfaces.
import { createAuthRateLimiters } from './auth-rate-limit.ts';

const auth = express.Router();

const { ipLimiter, loginEmailLimiter } = createAuthRateLimiters();

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(
  (id: number, done) => {
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
auth.post('/local/signup', ipLimiter, (req, res, next) => {
  const { email, password, displayName } = req.body;
  if (!displayName || displayName.length < 1 || displayName.length > 8) {
    return res.status(400).json({ error: 'Display name must be 1–8 characters' });
  }
  // Basic shape only — full isEmail still runs on the model after create. Require exactly one @
  // with non-empty, whitespace-free sides and a dotted domain, so obviously-malformed values get a
  // clean 400 instead of a 500 from the model's thrown ValidationError. The @-structure is matched
  // with a linear regex (two disjoint classes around a required @), then the domain dot is checked
  // with a plain string op — avoiding the polynomial-backtracking pattern CodeQL flagged.
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+$/.test(trimmedEmail) || !trimmedEmail.split('@')[1].includes('.')) {
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

// Normalize login emails the same way signup/update does (setEmailAndPassword lowercases
// before store). Without this, mixed-case login never matches the stored row (issue #170).
export function normalizeEmail (email: string): string {
  return email.toLowerCase();
}

// Local login
auth.post('/local/login', ipLimiter, loginEmailLimiter, (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/api/auth/whoami'
  })(req, res, next);
});

// Local login cont. Passport-local passes the "username" field as the first arg; the client
// sends the email there (browser/redux/reducers/auth.ts login()).
passport.use(new LocalStrategy(
  (email, password, done) => {
    const normalizedEmail = typeof email === 'string' ? normalizeEmail(email) : email;
    User.findOne({ where: { email: normalizedEmail } })
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

// Google OAuth cont. CLIENT_ID/CLIENT_SECRET are asserted non-null to preserve the runtime
// contract: with them unset the strategy constructor throws at boot, exactly as before.
passport.use(
  new GoogleStrategy({
    clientID: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
    callbackURL: '/api/auth/google/callback'
  },
  // Google will send back the token and profile
  function (token, refreshToken, profile, done) {
    // Google sends back info
    const info = {
      name: profile.displayName,
      email: profile.emails![0].value
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

export default auth;
