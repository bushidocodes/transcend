const { styleText } = require('node:util');
const { Map } = require('immutable');
const store = require('./redux/store');
const { createUser, updateUserData, removeUserAndEmit } = require('./redux/reducers/user-reducer');
const { addRoom, addSocketToRoom, removeSocketFromRoom } = require('./redux/reducers/room-reducer');
const { addSocket, removeSocket } = require('./redux/reducers/socket-reducer');

const { getRoomPeers } = require('./utils');

// How often clients should publish their position: emit on every Nth animation frame. Delivered
// to clients in the sceneState handshake so the server controls the update rate (issue #59/#69).
const TICK_RATE = 3;

// socket.io does not catch exceptions thrown inside an event handler — an uncaught throw
// becomes an uncaught exception on the server process and takes it down for EVERY connected
// user, so one malformed message is a remote denial-of-service (issue #112). Register every
// handler through this guarded path instead: `validate` (when given) must accept the payload
// or the message is dropped, and the handler body is caught and logged rather than crashing.
function on (socket, event, validate, handler) {
  socket.on(event, (...args) => {
    try {
      if (validate && !validate(...args)) {
        console.log(styleText('red', `[${socket.id}] dropped malformed '${event}' payload`));
        return;
      }
      handler(...args);
    } catch (err) {
      console.error(styleText('red', `[${socket.id}] handler for '${event}' threw:`), err);
    }
  });
}

const isObject = value => typeof value === 'object' && value !== null;

// Per-event payload validators (#112). `user` must be an object — createUser dereferences
// it — and a scene/room must be a string, since it's used as a room key (joinScene tolerates
// a missing scene; createUser treats it as "not yet placed").
const validJoinScene = (user, scene) => isObject(user) && (scene == null || typeof scene === 'string');
const validRoom = room => typeof room === 'string';

module.exports = io => {
  io.on('connection', socket => {
    let unsubscribe;

    console.log(styleText('yellow', `${socket.id} has connected`));
    socket.createdUser = false;
    store.dispatch(addSocket(socket));

    // joinScene is the single Stage 3 entry point (issue #69). It replaces the old
    //   connectUser -> renderAvatar -> getOthers -> getOthersCallback chain: the client sends its
    //   identity + room once (after login, once assets are ready), and the server creates the
    //   user and returns everything needed to render the room in one message — the client's own
    //   avatar, the other users already in that room (#58), and the tick rate to publish at.
    //   A single entry point also removes the old sceneLoad/createdUser ordering race.
    on(socket, 'joinScene', validJoinScene, (user, scene) => {
      socket.createdUser = true;
      // Single active session per account ("newest wins"): drop any prior socket for this
      // account before registering the new one (issue #30). Anonymous (no id) are exempt.
      const accountId = user && user.id != null ? user.id : null;
      socket.accountId = accountId;
      // When the new tab takes over an existing session in the SAME room, carry that session's
      // position/rotation forward so the user resumes exactly where they were standing instead of
      // respawning at a random point (new User() seeds a random x/z). A takeover into a DIFFERENT
      // room is left to that room's own spawn. Captured before disconnect, which deletes the record.
      let inheritedPosition = null;
      if (accountId != null) {
        store.getState().sockets.forEach(existing => {
          if (existing.id !== socket.id && existing.accountId === accountId) {
            console.log(styleText('red', `Account ${accountId} already has session ${existing.id}; replacing with ${socket.id}`));
            const prev = store.getState().users.get(existing.id);
            if (prev && prev.get('scene') === scene) {
              inheritedPosition = {
                x: prev.get('x'),
                y: prev.get('y'),
                z: prev.get('z'),
                xrot: prev.get('xrot'),
                yrot: prev.get('yrot'),
                zrot: prev.get('zrot')
              };
            }
            existing.emit('sessionReplaced');
            existing.disconnect(true);
          }
        });
      }
      store.dispatch(createUser(socket, user, scene));
      // Apply the inherited position over the fresh random spawn before building sceneState, so the
      // takeover tab renders at the carried-forward location.
      if (inheritedPosition) {
        store.dispatch(updateUserData(Map(Object.assign({ id: socket.id }, inheritedPosition))));
      }
      const allUsers = store.getState().users;
      socket.emit('sceneState', {
        you: store.getState().users.get(socket.id),
        others: getRoomPeers(allUsers, socket.id),
        tickRate: TICK_RATE
      });
    });

    // ready: the client has rendered the scene and wants live updates. Begin pushing the
    //   positions of the OTHER users in its room whenever the store changes. Collapses the old
    //   haveGottenOthers + readyToReceiveUpdates pair into one ack (#69).
    on(socket, 'ready', null, () => {
      unsubscribe = store.subscribe(() => {
        const allUsers = store.getState().users;
        socket.emit('usersUpdated', getRoomPeers(allUsers, socket.id));
      });
    });

    // On each tick update from a client, update the store, which triggers the subscriptions
    //   created for each client in the 'ready' handler.
    on(socket, 'tick', isObject, userData => {
      userData = Map(userData);
      store.dispatch(updateUserData(userData));
    });

    // Explicit logout: remove the avatar and tear down subscriptions without closing the socket,
    // so the client can re-register (via joinScene) on a subsequent login without reconnecting.
    on(socket, 'logoutUser', null, () => {
      if (socket.createdUser) {
        store.dispatch(removeUserAndEmit(socket));
        leaveChatRoom();
        if (unsubscribe) { unsubscribe(); unsubscribe = undefined; }
        socket.createdUser = false;
        socket.accountId = null;
      }
    });

    // When a socket disconnects, removes the user from the store, broadcast 'removeUser' to all
    //   clients, and remove the socket from any socket.io rooms or WebRTC P2P connections
    on(socket, 'disconnect', null, () => {
      store.dispatch(removeUserAndEmit(socket));
      console.log(styleText('magenta', `${socket.id} has disconnected`));
      leaveChatRoom();
      console.log(`[${socket.id}] disconnected`);
      store.dispatch(removeSocket(socket));
      if (unsubscribe) {
        // Conditional here to prevent a possible race condition where a user
        // disconnects before the `ready` event
        unsubscribe();
      }
    });

    // joinChatRoom joins a socket.io room and tells all clients in that room to establish a WebRTC
    //   connetions with the person entering the room.
    on(socket, 'joinChatRoom', validRoom, function (room) {
      console.log(`[${socket.id}] join ${room}`);
      if (!(store.getState().rooms.has(room))) {
        console.log(`Adding ${room} to state`);
        store.dispatch(addRoom(room));
      }
      const roomOnState = store.getState().rooms.get(room);
      roomOnState.valueSeq().forEach(peer => {
        peer.emit('addPeer', { peer_id: socket.id, should_create_offer: false });
        socket.emit('addPeer', { peer_id: peer.id, should_create_offer: true });
      });
      store.dispatch(addSocketToRoom(room, socket));
      socket.join(room);
      socket.currentChatRoom = room;
    });

    // leaveChatRoom leaves the current socket.io room and tells all clients to tear down WebRTC
    //   connections with the person leaving the room.
    function leaveChatRoom () {
      const room = socket.currentChatRoom;
      if (room) {
        console.log(`[${socket.id}] leaveChatRoom ${room}`);
        socket.leave(room);
        store.dispatch(removeSocketFromRoom(room, socket));
        const roomOnState = store.getState().rooms.get(room);
        roomOnState.valueSeq().forEach(peer => {
          peer.emit('removePeer', { peer_id: socket.id });
          socket.emit('removePeer', { peer_id: peer.id });
        });
        socket.currentChatRoom = null;
      } else {
        console.log('Not currently in room, so nothing to leave');
      }
    }
    on(socket, 'leaveChatRoom', null, () => leaveChatRoom());

    // If any user is an Ice Candidate, tells other users to set up a ICE connection with them
    on(socket, 'relayICECandidate', isObject, function (config) {
      const peerId = config.peer_id;
      const iceCandidate = config.ice_candidate;
      console.log(`[${socket.id}] relaying ICE candidate to [${peerId}] ${iceCandidate}`);
      const sockets = store.getState().sockets;
      if (sockets.has(peerId)) {
        sockets.get(peerId).emit('iceCandidate', { peer_id: socket.id, ice_candidate: iceCandidate });
      }
    });

    // Send the answer back to the new user in order to complete the handshake
    on(socket, 'relaySessionDescription', isObject, function (config) {
      const peerId = config.peer_id;
      const sessionDescription = config.session_description;
      console.log(`[${socket.id}] relaying session description to [${peerId}] ${sessionDescription}`);
      const sockets = store.getState().sockets;

      if (sockets.has(peerId)) {
        sockets.get(peerId).emit('sessionDescription', { peer_id: socket.id, session_description: sessionDescription });
      }
    });
  });
};
