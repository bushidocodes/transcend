# Transcend

[![CI](https://github.com/bushidocodes/transcend/actions/workflows/ci.yml/badge.svg)](https://github.com/bushidocodes/transcend/actions/workflows/ci.yml)

***v.*** be or go beyond the range or limits of

A VR environment in which people across geographical boundaries can congregate, move around, explore, and interact as if they were actually together. It's a world that goes beyond traditional boundaries, allowing people from different places, situations, and walks of life to come together to share ideas and experiences.

## Why?

Social VR apps like [AltSpace](https://altvr.com/) and [vTime](https://vtime.net/) are redefining what it means to hang out with someone(s). Fullstack Academy has chosen Daydream as its VR platform of choice for its Remote Immersive program. However, vTime has only recently added Daydream support, and AltSpace still doesn't natively support Daydream. Both only allow small groups, up to six people/avatars, to join one "room" and hang out with each other.

As Mark Davis, Fullstack's Product Manager, describes [in a post about Fullstack's VR Lab](https://www.fullstackacademy.com/blog/vr-lab-jan-2017):

> Here’s what we wish existed, now: a simple VR environment where up to 25 avatars can interact with each other, with real-time voice chat, that’s accessible on a Google Daydream headset as an MVP, but is also extensible to any WebVR enabled headset.

This project serves to address that need. Transcend was built by [Joey Darbyshire](https://github.com/Jmikeydarby), [Sean McBride](https://github.com/spmcbride1201), [Yoo-Nah Park](https://github.com/parky22), and [Beth Qiang](https://github.com/bethqiang) as their Capstone Project during their Senior Phase at [Fullstack Academy](https://www.fullstackacademy.com/).

## Demo

[Here's our presentation](https://www.youtube.com/watch?v=I5ND_1PI77c) with a demo and discussion of the architecture and the challenges we faced while building it. To try it yourself, follow [Installation](#installation) and run a local build.

## Architecture

Transcend is built on [Node.js](https://nodejs.org/en/) using [Socket.io](http://socket.io/) for event-based client-server interaction, [WebRTC](https://webrtc.org/) for real-time audio communication, [A-Frame](https://aframe.io/) for 3D graphics and scene rendering and WebVR capabilities, and [React](https://facebook.github.io/react/) as a view layer.

**Client:** [Redux](http://redux.js.org/) holds view/UI state as plain objects (auth, scene-loaded flag, WebRTC peers/media, and config).

**Server:** Authoritative multiplayer state lives in a plain `GameState` (user records keyed by socket id). Room membership and the socket registry are socket.io's own — scenes and voice-chat rooms use prefixed socket.io rooms rather than application-level maps. A fixed-rate, room-scoped broadcast loop pushes dirty-room snapshots to clients instead of fanning out on every inbound tick.

**Language & tooling:** The whole codebase is [TypeScript](https://www.typescriptlang.org/) (strict, type-erasable syntax only). Nothing is compiled to run: Node 24 executes the server's `.ts` files directly via type stripping, [esbuild](https://esbuild.github.io/) bundles the browser entry (`npm run build`), and [Vitest](https://vitest.dev/) runs the tests. `npm run typecheck` (tsc `--noEmit`) is the only step that sees the types.

## How to Play

Transcend supports keyboard & mouse controls on Chrome 56 or higher on a PC or Mac.

Google Daydream headset & controller integration coming soon.

### Keyboard and Mouse Controls

#### Camera Movement

* Lock Mouse: Click the 3D Scene
* Moving your mouse left, right, up, and down turns the camera left, right, up, and down respectively
* Unlock Mouse: Press ESC

#### Avatar Movement

* Walk Forward: W or up arrow
* Walk Backward: S or down arrow
* Sidestep Left: A or left arrow
* Sidestep Right: S or right arrow

#### Cursor

The ring in the center of your screen represents your cursor, which is your tool for interacting with the world. Certain elements in the world respond to your cursor hovering over a selectable object for one continuous second. An object is responding to your cursor when it glows a translucent blue, similar to an HTML hyperlink.

### Teleporters

Teleporters, the floating labeled orbs in all of the rooms, are the way you move between VR scenes. They cause you to leave one scene and enter another. Teleporters can be activated via cursor selection.

### Costumes in "The Gap"

In this VR universe, The Gap is where the fashion happens. Hover your cursor over a mannequin wearing an avatar you like for one second to switch your "skin". You should hear a voice confirming that you now are that avatar. Talk about Fast Fashion!

### UI Wheel

When you are in game, look down where your feet would be and you'll notice a microphone button. No, it's not for your [Reebok Pumps](https://en.wikipedia.org/wiki/Reebok_Pump). C'mon, you can't even jump in this world! The button mutes your in-game microphone. Stare at it for a second, and you'll see the button change between recording and muted states. Hope you can hold your sneeze that long!

## Installation

To install Transcend on your computer, you will need [Node.js 24+](https://nodejs.org/en/download/) (see `.nvmrc` / `package.json` `engines`) and [PostgreSQL](http://postgresguide.com/setup/install.html).

### 1. Install dependencies

```
npm install
```

### 2. Environment

Copy the example env file and edit values as needed:

```
cp .env.example .env
```

Important variables (see comments in `.env.example` for the full list):

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Signs the session cookie. **Required in production** — the server refuses to boot without it. In development it falls back to an insecure key with a warning. Generate with `openssl rand -hex 32`. |
| `DATABASE_URL` | Postgres connection string for the app (default in `.env.example`: `postgres://localhost:5432/transcend`). |
| `DATABASE_TEST_URL` | Separate database used by `npm test` so force-sync never touches the dev DB (default: `postgres://localhost:5432/transcend_test`). |
| `PORT` | HTTP listen port. If unset, the server defaults to **1337**. `.env.example` sets `4000` when you copy it. |
| `CLIENT_ID` / `CLIENT_SECRET` | Google OAuth credentials. **Required at boot** (Passport constructs the Google strategy even if you only use email/password). Dummy placeholders are fine for local password-only use; real values needed for "Log in with Google". |

Node loads `.env` at process start via `process.loadEnvFile()` (`server/load-env.ts`). Variables already set in the shell are not overridden.

### 3. Database

Ensure PostgreSQL is running and reachable at `DATABASE_URL`.

On server start, `prepare()` (see `db/index.ts`):

- In non-production, **creates the database if it does not exist** (connects to the same host’s `postgres` maintenance DB).
- Runs **pending Umzug migrations** automatically (`migrations/*.ts`). You do not need `npm run migrate` for a normal boot.

Optional but recommended for local play — seed demo accounts (password `1234`, e.g. `sean@transcend.vr`):

```
npm run seed
```

Manual migration CLI (usually unnecessary; boot already migrates):

```
npm run migrate        # up
npm run migrate:undo   # down one
```

For the test database, see [TESTING.md](TESTING.md) (`createdb transcend_test` / `DATABASE_TEST_URL`).

### 4. Start the app

```
npm start
```

`npm start` runs `npm run build` (esbuild → `public/bundle.js`) then starts the server with file watching. The game is at `http://localhost:1337` (or `http://localhost:$PORT` if `PORT` is set — e.g. `4000` when using the stock `.env.example`).

To rebuild without restarting, or run the server alone after a prior build:

```
npm run build
npm run server
```

### Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Build client bundle, then run the server with `--watch` |
| `npm run build` / `build-watch` / `build-prod` | esbuild client bundle (dev, watch, or minified production) |
| `npm run server` | Server only (`node --watch server/index.ts`) |
| `npm run seed` | Insert demo users into the database |
| `npm run migrate` / `migrate:undo` | Apply or undo Umzug migrations |
| `npm run lint` / `lint:fix` | Biome check (and auto-fix) |
| `npm run format` | Biome format |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `test-watch` / `test:coverage` | Vitest suite (see [TESTING.md](TESTING.md)) |

### Docker (prod-parity)

A multi-stage `Dockerfile` and `docker-compose.yml` run the production build together with Postgres:

```
docker compose up --build
```

Then open `http://localhost:1337`. Compose sets `DATABASE_URL` and a throwaway `SESSION_SECRET`; replace the secret before any real deploy. The app image healthcheck hits `/healthz`.

## Help

Create an [issue](https://github.com/bushidocodes/transcend/issues) or submit a pull request if you need help or find a bug. Contributions and ideas welcome!
