/**
 * Wire Express session + Passport onto Engine.IO so socket handlers can read
 * socket.request.user (issue #167).
 *
 * Kept as a named export so unit tests can assert the three middlewares are
 * registered on io.engine — the integration path in socket.test.ts still injects
 * a mock user via handshake.auth because spinning up Postgres-backed sessions
 * for every multiplayer test is heavy. Without this helper, deleting the three
 * io.engine.use lines from index.ts would leave those tests green.
 */
import type { RequestHandler } from 'express';

export interface EngineLike {
  use: (middleware: RequestHandler) => void;
}

export interface SocketIoLike {
  engine: EngineLike;
}

export function attachSessionToEngine(
  io: SocketIoLike,
  sessionMiddleware: RequestHandler,
  passportInit: RequestHandler,
  passportSession: RequestHandler
): void {
  io.engine.use(sessionMiddleware);
  io.engine.use(passportInit);
  io.engine.use(passportSession);
}
