const auth = require('express').Router();
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

const User = require('../db').model('users');

// The complete set of selectable skins, mirroring the Mannequins offered in the
// ChangingRoom (browser/react/components/ChangingRoom.js). Each value is the basename of a
// file in public/images/ and is interpolated into a `skinUrl: ../../images/${skin}.png`
// A-Frame component string rendered on every client, so it must be validated server-side
// (issue #79) — otherwise an authenticated user could persist an arbitrary string (path
// traversal, A-Frame component injection seen by other users, unbounded length).
const VALID_SKINS = new Set([
  '3djesus', 'agentsmith', 'batman', 'char', 'god', 'Iron-Man-Minecraft-Skin', 'jetienne',
  'Joker', 'Mario', 'martialartist', 'robocop', 'Sonicthehedgehog', 'woody', 'powerRanger',
  'catwoman', 'blackWidow', 'evilQueen', 'graceHopper', 'princessBelle', 'skaterGirl',
  'katnissEverdeen', 'theflash', 'Superman', 'Spiderman'
]);

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

// Local signup
auth.post('/local/signup', (req, res, next) => {
  const { displayName } = req.body;
  if (!displayName || displayName.length < 1 || displayName.length > 8) {
    return res.status(400).json({ error: 'Display name must be 1–8 characters' });
  }
  User.create(req.body)
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
