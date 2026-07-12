import { io, type Socket } from 'socket.io-client';
import { getSocket, setSocket, clearSocket as clearSocketHolder } from './socket-holder.ts';
import { EVENTS, type SceneState, type UsersMap } from '../shared/protocol.ts';
import store from './redux/store.ts';
import { setTickRate } from './redux/reducers/config-reducer.ts';
import { addFirstPersonProperties } from './utils.ts';
import { currentRoom } from './navigate.ts';
import * as avatars from './avatars.ts';
import './aframeComponents/publish-location.ts';
import './aframeComponents/remote-pose.ts';
import './aframeComponents/webrtc-controls.ts';
import './aframeComponents/wall-collision.ts';
import { disconnectUser, addPeerConn, removePeerConn, setRemoteAnswer, setIceCandidate, joinChatRoom, releaseLocalMediaStream } from './webRTC/client.ts';

// joinScene is emitted once by <App> on mount (browser/react/components/App.tsx). The
// 'connect' event, however, also fires on every socket.io *re*connect, where <App> is
// already mounted and will NOT re-emit it. Distinguish the two with this flag.
let hasConnected = false;
// Create the socket and wire up its event handlers, publishing the instance through
// browser/socket-holder.ts (issue #120 — see that module for why the instance lives there).
// Idempotent while a socket exists: later calls return the existing instance so handlers are
// not double-registered. On logout, clearSocket() disconnects and nulls the singleton so the
// next login opens a fresh handshake and re-derives socket.request.user from the new session
// (issue #199). Reusing the same Engine.IO connection across accounts left the prior Passport
// user stamped on the handshake request.
export function initSocket (): Socket {
  const existing = getSocket();
  if (existing) return existing;

  // New connection instance — first CONNECT is the initial join path, not a reconnect.
  hasConnected = false;
  const socket = setSocket(io(window.location.origin));

  socket.on(EVENTS.CONNECT, () => {
    console.log('You\'ve made a persistent two-way connection to the server!');
    if (!hasConnected) {
      hasConnected = true;
      return; // initial connect — <App> handles the first joinScene on mount
    }
    // Reconnect (typically the server restarted, possibly a network blip). The server lost
    // our in-memory user record and assigned us a new socket id. Because <App> stays mounted
    // across a reconnect, joinScene never re-fires on its own, so the server only learns of
    // us again from position ticks — which carry no displayName — and everyone (including us)
    // sees a default "John" ghost (issue #56). Re-register explicitly: drop the stale local
    // avatar, then replay joinScene so the server rebuilds the full record and replies with a
    // fresh sceneState that repopulates our avatar under the new id (issue #69).
    const auth = store.getState().auth;
    const scene = currentRoom();
    if (scene && auth && auth.id != null) {
      console.log('Reconnected — re-registering this client with the server (issue #56)');
      avatars.removeLocal();
      socket.emit(EVENTS.JOIN_SCENE, auth, scene);
      // Also re-establish WebRTC audio. The chat-room join lives in <App>'s route-keyed effect
      // (issue #70), which doesn't re-run on a socket reconnect, and the old peer connections
      // were torn down on disconnect — so without this, avatars/positions recover but audio
      // stays silent until a refresh. joinChatRoom reuses the existing mic stream and just
      // re-emits, so the server re-pairs us with the room (issue #71).
      joinChatRoom(scene);
    }
  });

  // sceneState is the server's single reply to joinScene (issue #69): our own avatar, the other
  //   users already in our room, and the tick rate to publish at. It replaces the old
  //   renderAvatar + getOthersCallback pair. Render everything, store the tick rate (which
  //   enables publish-location), then send one 'ready' ack so the server starts streaming
  //   usersUpdated.
  socket.on(EVENTS.SCENE_STATE, ({ you, others, tickRate }: SceneState) => {
    const avatar = avatars.setLocal(you);
    addFirstPersonProperties(avatar, you);
    // others is room-scoped already (#58); render each peer (and drop any stragglers from a
    // previous session/room — sync reconciles removals too).
    avatars.sync(others);
    store.dispatch(setTickRate(tickRate));
    socket.emit(EVENTS.READY);
  });

  // The server sends usersUpdated with only the OTHER users in this client's room (#58);
  //   AvatarManager reconciles the scene against it (add/update/redraw/remove, issue #118).
  socket.on(EVENTS.USERS_UPDATED, (users: UsersMap) => avatars.sync(users));

  socket.on(EVENTS.REMOVE_USER, (userId: string) => avatars.remove(userId));

  // Adds a Peer to our DoM as their own Audio Element
  socket.on(EVENTS.ADD_PEER, addPeerConn);

  // Removes Peer from DoM after they have disconnected or switched room
  socket.on(EVENTS.REMOVE_PEER, removePeerConn);

  // Replies to an offer made by a new Peer
  socket.on(EVENTS.SESSION_DESCRIPTION, setRemoteAnswer);

  // Handles setting the ice server for an ice Candidate
  socket.on(EVENTS.ICE_CANDIDATE, setIceCandidate);

  // Removes all peer connections and audio Elements from the DoM
  socket.on(EVENTS.DISCONNECT, disconnectUser);

  // sessionReplaced: the server enforces a single active session per account ("newest wins",
  //   issue #30). When this account logs in from another window, the server boots this socket
  //   and emits sessionReplaced first. Without handling it, this tab becomes a zombie — booted
  //   server-side and invisible to everyone, but the local first-person camera + publish-location
  //   keep running, so it still *looks* like a live, movable session. Stop being a live session:
  //   kill auto-reconnect (so we don't ping-pong with the newer tab), disconnect locally, drop our
  //   avatar, and block the scene with an overlay that lets the user reclaim the session here.
  socket.on(EVENTS.SESSION_REPLACED, () => {
    console.warn('This session was opened in another window; this tab has been disconnected.');
    socket.io.opts.reconnection = false;
    socket.disconnect();
    avatars.removeLocal();
    // Release the microphone. disconnectUser (on the 'disconnect' event) tears down the peer
    // connections and remote <audio> tags, but not the local mic stream — and it must not, since
    // a transient-reconnect reuses that same stream (see the reconnect handler above). This is the
    // terminal path, so stop the mic here so the dead tab doesn't keep the input device open.
    releaseLocalMedia();
    showSessionReplacedOverlay();
  });

  return socket;
}

// Full-screen blocking overlay shown when this session is replaced by a newer login. Built with
// direct DOM (like removeLocalAvatar below) so it renders regardless of the current React route
// and sits above the A-Frame canvas. Reloading re-runs the auth → joinScene flow, which makes
// THIS tab the newest session and reclaims the account here.
function showSessionReplacedOverlay (): void {
  if (document.getElementById('session-replaced-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'session-replaced-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    zIndex: '99999',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '24px',
    background: 'rgba(0, 0, 0, 0.92)',
    color: '#fff',
    fontFamily: 'sans-serif'
  });

  const message = document.createElement('p');
  message.textContent = 'This session was opened in another window.';
  message.style.fontSize = '20px';
  message.style.marginBottom = '20px';

  const button = document.createElement('button');
  button.textContent = 'Use it here';
  Object.assign(button.style, {
    fontSize: '16px',
    padding: '10px 20px',
    cursor: 'pointer'
  });
  button.addEventListener('click', () => window.location.reload());

  overlay.appendChild(message);
  overlay.appendChild(button);
  document.body.appendChild(overlay);
}

// Stop the local microphone tracks so a terminated tab releases the input device. Safe only on a
// terminal teardown (e.g. sessionReplaced, logout) — NOT on a transient disconnect, where the
// stream is reused on reconnect. Exported so Logout can free the mic without going through
// the socket event path (issue #172). Delegates to client.ts, which owns the MediaStream
// registry and clears hasLocalMedia (issue #176).
export function releaseLocalMedia (): void {
  releaseLocalMediaStream();
}

// Logout teardown (issue #199): disconnect the Engine.IO connection and drop the singleton so
// the next login re-handshakes with the new Passport session. Also resets hasConnected so
// initSocket treats the next connection as an initial connect (App emits joinScene on mount).
export function clearSocket (): void {
  clearSocketHolder();
  hasConnected = false;
}

export default initSocket;
