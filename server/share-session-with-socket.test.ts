/**
 * Guards the Engine.IO session wiring (issue #167).
 *
 * socket.test.ts stubs socket.request.user via handshake.auth, so it cannot catch a
 * regression that drops io.engine.use(sessionMiddleware) from the boot path. These
 * tests cover (1) the helper that registers the three middlewares and (2) that
 * server/index.ts still calls that helper with the shared session/passport instances.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestHandler } from 'express';
import { attachSessionToEngine } from './share-session-with-socket.ts';

describe('attachSessionToEngine (issue #167)', () => {
  it('registers session, passport.initialize, and passport.session on io.engine in order', () => {
    const uses: RequestHandler[] = [];
    const io = {
      engine: {
        use (mw: RequestHandler) { uses.push(mw); }
      }
    };
    const sessionMiddleware = ((_req, _res, next) => next()) as RequestHandler;
    const passportInit = ((_req, _res, next) => next()) as RequestHandler;
    const passportSession = ((_req, _res, next) => next()) as RequestHandler;

    attachSessionToEngine(io, sessionMiddleware, passportInit, passportSession);

    expect(uses).toEqual([sessionMiddleware, passportInit, passportSession]);
  });
});

describe('server/index.ts session wiring (issue #167)', () => {
  it('calls attachSessionToEngine with the shared session and passport middleware', () => {
    const indexPath = join(dirname(fileURLToPath(import.meta.url)), 'index.ts');
    const src = readFileSync(indexPath, 'utf8');
    // Named helper import — prevents silent deletion of the Engine.IO bridge.
    expect(src).toMatch(/import\s+\{\s*attachSessionToEngine\s*\}\s+from\s+['"]\.\/share-session-with-socket\.ts['"]/);
    expect(src).toMatch(/attachSessionToEngine\s*\(\s*io\s*,\s*sessionMiddleware\s*,\s*passportInit\s*,\s*passportSession\s*\)/);
  });
});
