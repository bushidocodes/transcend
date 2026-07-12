# Testing

## Automated tests

### Test database setup

Tests run under `NODE_ENV=testing` and connect to a separate `transcend_test` database so
`db.sync({ force: true })` (which truncates tables between test runs) never touches the dev DB.

The default URL when no env vars are set is `postgres://localhost:5432/transcend_test`.

Create the database once:

```
createdb transcend_test
```

If your Postgres is not on the default port, or requires credentials, set
`DATABASE_TEST_URL` before running tests:

```
DATABASE_TEST_URL=postgres://postgres:postgres@localhost:5433/transcend_test npm test
```

`DATABASE_TEST_URL` takes priority over `DATABASE_URL` during test runs, so a
shell-exported `DATABASE_URL` (pointing at the live dev DB) cannot accidentally cause
the force-sync to wipe it.

### Running the suite

```
npm test
```

All test files are TypeScript (`**/*.test.ts`) and run through Vitest; the
suite covers the User model, the shared wire protocol and skin catalog, the
auth routes and rate limits, GameState, the socket.io integration layer, and
browser-side units (avatars, pose buffer, rooms, navigation, skin loading).

---

## Manual smoke test

Perform this after every dependency bump to confirm the golden path still works.

### Prerequisites

- `npm run build` completes without error (esbuild emits `public/bundle.[hash].js` and `public/app.html`).
- Server running: `npm run server` (or `npm start` which also builds).
- At least one user account exists: run `npm run seed` for demo accounts
  (password `1234`, emails like `sean@transcend.vr`) or register with
  email/password on the login page.

### Steps

1. **Login** — open the app in a browser. Log in with email + password (not Google OAuth,
   which requires valid credentials). You should be redirected into the VR lobby.

2. **Lobby renders** — confirm the A-Frame scene loads: floor, walls, and teleporter orbs
   are visible. No red "A-Frame could not" errors in the browser console.

3. **Orb signs render** — each teleporter orb should display a text label naming the
   destination room. If labels are blank or missing, the font self-hosting is broken.

4. **Mouselook** — click anywhere in the scene. The cursor should disappear and the camera
   should track mouse movement (pointer-lock). Press Escape to release.

5. **Fuse teleport** — move the crosshair onto a teleporter orb and hold it there for
   ~2 seconds (fuse animation). The scene should transition to the target room.

6. **Cross-room navigation** — teleport through at least two rooms and back to the lobby to
   confirm bi-directional navigation works.

7. **Multi-user avatar** — open a second browser tab/window and log in as a different user.
   Both sessions should see each other's avatars moving in real time (socket.io).

### Pass criteria

All seven steps complete without a browser console error or a page freeze.
