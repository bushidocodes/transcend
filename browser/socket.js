/* global socket */
import { io } from 'socket.io-client';
import { fromJS } from 'immutable';
import { EVENTS } from '../shared/protocol';
import store from './redux/store';
import { receiveUsers } from './redux/reducers/user-reducer';
import { setTickRate } from './redux/reducers/config-reducer';
import { putUserOnDOM, putUserBodyOnDOM, addFirstPersonProperties } from './utils';
import './aframeComponents/publish-location';
import './aframeComponents/webrtc-controls';
import './aframeComponents/wall-collision';
import { disconnectUser, addPeerConn, removePeerConn, setRemoteAnswer, setIceCandidate, joinChatRoom } from './webRTC/client';

// Track the socket id our local avatar was rendered under so we can tear it down on a
// reconnect (the id changes when the server hands us a new socket).
let localAvatarId = null;
// joinScene is emitted once by <App> on mount (browser/react/components/App.js). The
// 'connect' event, however, also fires on every socket.io *re*connect, where <App> is
// already mounted and will NOT re-emit it. Distinguish the two with this flag.
let hasConnected = false;
// Guards initSocket() so io() + the socket.on handlers run exactly once for the lifetime of
// the page. Socket creation is deferred until the user has a valid auth session (issue #67),
// at which point <App> calls initSocket() on mount. A logout→login cycle without a full page
// reload remounts <App> and calls initSocket() again, but the socket (and its handlers, and
// the hasConnected flag) must be reused rather than re-created — otherwise every handler would
// be registered twice and fire twice per event.
let initialized = false;

// Create the socket and wire up its event handlers. Idempotent: the first call performs the
// real initialization; later calls return the existing window.socket untouched. Returns the
// socket instance so callers can emit immediately after init.
export function initSocket () {
  if (initialized) return window.socket;
  initialized = true;

  // All A-Frame components need access to the socket instance
  window.socket = io(window.location.origin);

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
    if (auth && typeof auth.has === 'function' && auth.has('id')) {
      console.log('Reconnected — re-registering this client with the server (issue #56)');
      removeLocalAvatar();
      const scene = window.location.pathname.replace(/\//g, '') || 'root';
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
  socket.on(EVENTS.SCENE_STATE, ({ you, others, tickRate }) => {
    const avatar = putUserOnDOM(you);
    // Remember the id we rendered under (the server sends a plain object) so a later
    // reconnect can find and remove this exact avatar.
    localAvatarId = you && you.id;
    addFirstPersonProperties(avatar, you);

    // others is room-scoped already (#58); render each peer's head + body.
    Object.keys(others || {}).forEach(id => {
      putUserOnDOM(others[id]);
      putUserBodyOnDOM(others[id]);
    });

    store.dispatch(setTickRate(tickRate));
    socket.emit(EVENTS.READY);
  });

  // The server now sends usersUpdated with only the OTHER users in this client's room (#58),
  //   so the client no longer filters by scene. Add new avatars, update existing ones, and
  //   reconcile removals: any avatar on the DOM that's absent from this room-scoped payload has
  //   left the room (or we changed rooms), so it's dropped. The avatar components (head and
  //   body) are added, updated, or deleted depending on the state of the client's DOM.
  socket.on(EVENTS.USERS_UPDATED, users => {
    store.dispatch(receiveUsers(fromJS(users)));
    const receivedUsers = store.getState().users;
    const liveIds = new Set();
    receivedUsers.valueSeq().forEach(user => {
      liveIds.add(user.get('id'));
      const avatarHead = document.getElementById(user.get('id'));
      const avatarBody = document.getElementById(`${user.get('id')}-body`);
      // If a user's avatar is NOT on the DOM already, add it
      if (avatarHead === null) {
        const userObj = user.toJS();
        putUserOnDOM(userObj);
        putUserBodyOnDOM(userObj);
        // If the user's avatar is on the DOM, but not the right skin, remove and redraw it
      } else if (avatarHead.getAttribute('skin') !== user.get('skin')) {
        removeUser(user.get('id'));
        const userObj = user.toJS();
        putUserOnDOM(userObj);
        putUserBodyOnDOM(userObj);
        // Otherwise, just update the avatar's position attributes
      } else {
        avatarHead.setAttribute('position', `${user.get('x')} ${user.get('y')} ${user.get('z')}`);
        avatarHead.setAttribute('rotation', `${user.get('xrot')} ${user.get('yrot')} ${user.get('zrot')}`);
        avatarBody.setAttribute('position', `${user.get('x')} ${user.get('y')} ${user.get('z')}`);
        avatarBody.setAttribute('rotation', `0 ${user.get('yrot')} 0`);
      }
    });
    // Drop any other-user avatar that's no longer in our room's payload (they left, or we did).
    document.querySelectorAll('a-minecraft[id]').forEach(el => {
      const id = el.getAttribute('id');
      if (!id || id.endsWith('-body') || id === window.socket.id) return;
      if (!liveIds.has(id)) removeUser(id);
    });
  });

  socket.on(EVENTS.REMOVE_USER, userId => removeUser(userId));

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
    removeLocalAvatar();
    // Release the microphone. disconnectUser (on the 'disconnect' event) tears down the peer
    // connections and remote <audio> tags, but not the local mic stream — and it must not, since
    // a transient-reconnect reuses that same stream (see the reconnect handler above). This is the
    // terminal path, so stop the mic here so the dead tab doesn't keep the input device open.
    releaseLocalMedia();
    showSessionReplacedOverlay();
  });

  return window.socket;
}

// Full-screen blocking overlay shown when this session is replaced by a newer login. Built with
// direct DOM (like removeLocalAvatar below) so it renders regardless of the current React route
// and sits above the A-Frame canvas. Reloading re-runs the auth → joinScene flow, which makes
// THIS tab the newest session and reclaims the account here.
function showSessionReplacedOverlay () {
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
// terminal teardown (e.g. sessionReplaced) — NOT on a transient disconnect, where the stream is
// reused on reconnect.
function releaseLocalMedia () {
  const stream = store.getState().webrtc.get('localMediaStream');
  if (stream && stream.getTracks) stream.getTracks().forEach(track => track.stop());
}

// Remove the local (first-person) avatar, its child cursor, and the separate mutebutton
// entity so a reconnect can rebuild them cleanly under the new socket id without leaving
// a duplicate camera or a duplicate #mutebutton on the DOM.
function removeLocalAvatar () {
  let head = localAvatarId ? document.getElementById(localAvatarId) : null;
  // Fall back to the publish-location marker in case the id was never captured.
  if (!head) head = document.querySelector('a-minecraft[publish-location]');
  if (head && head.parentNode) head.parentNode.removeChild(head);
  const mutebutton = document.getElementById('mutebutton');
  if (mutebutton && mutebutton.parentNode) mutebutton.parentNode.removeChild(mutebutton);
  localAvatarId = null;
}

// Remove the avatar of userID from the A-Frame scene and DOM.
function removeUser (userId) {
  console.log('Removing user ', userId);
  const scene = document.getElementById('scene');
  const headToBeRemoved = document.getElementById(userId);
  console.log(`Attempting to remove ${userId}-body`);
  const bodyToBeRemoved = document.getElementById(`${userId}-body`);
  if (headToBeRemoved) {
    scene.remove(headToBeRemoved);
    headToBeRemoved.parentNode.removeChild(headToBeRemoved);
  }
  if (bodyToBeRemoved) {
    scene.remove(bodyToBeRemoved);
    bodyToBeRemoved.parentNode.removeChild(bodyToBeRemoved);
  }
}

export default initSocket;
