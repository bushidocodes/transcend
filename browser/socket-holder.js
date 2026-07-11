// Holds the one socket instance (issue #120). This is a separate leaf module — rather than a
// variable inside browser/socket.js — so that consumers (webRTC signaling, the
// publish-location tick component, changeUserSkin, the Logout route) can import the accessor
// without importing browser/socket.js back, which would create an import cycle: socket.js
// imports their handlers/components to wire them up, and they'd import its accessor in return.
// socket.js is the only module that ever calls setSocket, from initSocket().

let socket = null;

// Returns null before initSocket() has run (pre-login), so callers that can race init must
// guard — the same contract the old window.socket global had, but visible to the bundler and
// stubbable in tests.
export function getSocket () {
  return socket;
}

export function setSocket (instance) {
  socket = instance;
  return socket;
}
