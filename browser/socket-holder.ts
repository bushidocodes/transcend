// Holds the one socket instance (issue #120). This is a separate leaf module — rather than a
// variable inside browser/socket.ts — so that consumers (webRTC signaling, the
// publish-location tick component, changeUserSkin, the Logout route) can import the accessor
// without importing browser/socket.ts back, which would create an import cycle: socket.ts
// imports their handlers/components to wire them up, and they'd import its accessor in return.
// socket.ts is the only module that ever calls setSocket, from initSocket(). clearSocket is
// called on logout so the next login re-handshakes with a fresh Passport session (#199).

import type { Socket } from 'socket.io-client';

let socket: Socket | null = null;

// Returns null before initSocket() has run (pre-login), so callers that can race init must
// guard — the same contract the old window.socket global had, but visible to the bundler and
// stubbable in tests.
export function getSocket (): Socket | null {
  return socket;
}

export function setSocket (instance: Socket): Socket {
  socket = instance;
  return socket;
}

// Disconnect and drop the singleton so the next initSocket() opens a new Engine.IO connection
// (and re-runs passport.session() on the handshake). Safe when no socket exists.
export function clearSocket (): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
