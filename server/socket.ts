import { styleText } from 'node:util';
import type { Server, Socket } from 'socket.io';
import { EVENTS, isObject, validJoinScene, validRoom } from '../shared/protocol.ts';
import type { Pose } from '../shared/protocol.ts';
import GameState from './game-state.ts';
import VALID_SKINS from './validSkins.ts';
import { SocketRateLimiter, SOCKET_RATE_LIMITS } from './socket-rate-limit.ts';

// Per-connection bookkeeping the handlers hang off the socket object itself (same as the JS
// version did): whether joinScene ran, which account owns the session, and current rooms.
interface GameSocket extends Socket {
  createdUser?: boolean;
  accountId?: number | string | null;
  sceneRoom?: string | null;
  currentChatRoom?: string | null;
}

// How often clients should publish their position: emit on every Nth animation frame. Delivered
// to clients in the sceneState handshake so the server controls the update rate (issue #59/#69).
const TICK_RATE = 3;

// How often the server pushes room snapshots to clients (issue #115). The SERVER sets the
// broadcast rate — 20 Hz — independent of how many clients are ticking or how fast; incoming
// ticks only accumulate into GameState between beats.
const BROADCAST_INTERVAL_MS = 50;

// socket.io does not catch exceptions thrown inside an event handler — an uncaught throw
// becomes an uncaught exception on the server process and takes it down for EVERY connected
// user, so one malformed message is a remote denial-of-service (issue #112). Register every
// handler through this guarded path instead: `validate` (when given) must accept the payload
// or the message is dropped, and the handler body is caught and logged rather than crashing.
// The per-event payload validators live with the event names in shared/protocol.ts (#117).
//
// Optional `rateLimit` (issue #203): when provided, excess events for this socket are dropped
// before validation/handler so a flood cannot burn CPU on payload checks or dirty the scene.
//
// Payloads are `unknown`, deliberately: a validator only proves the coarse protocol shape, so
// each handler re-narrows the fields it actually reads (typeof/isObject) instead of asserting
// a trusted type onto attacker-controlled input.
function on (
  socket: Socket,
  event: string,
  validate: ((...args: unknown[]) => boolean) | null,
  handler: (...args: unknown[]) => void,
  rateLimit?: SocketRateLimiter
): void {
  socket.on(event, (...args: unknown[]) => {
    try {
      if (rateLimit && !rateLimit.allow(socket.id)) {
        return;
      }
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

// Scenes and voice-chat rooms both live in socket.io's own room registry now (issue #116),
// under distinct prefixes so a chat room named after a scene can't receive scene broadcasts.
const sceneRoomOf = (scene: string): string => `scene:${scene}`;
const chatRoomOf = (room: string): string => `chat:${room}`;

export default function attachSocketServer (io: Server): void {
  // Durable domain state only — plain user records keyed by socket id (issue #116). The
  // socket registry is io.sockets.sockets and room membership is socket.io rooms; neither is
  // duplicated into application state anymore.
  const gameState = new GameState();

  // Per-socket rate limiters for chatty events (issue #203). Separate buckets so a burst of
  // ticks cannot starve a legitimate changeScene, etc. Keys are socket ids; forgotten on
  // disconnect so the maps stay bounded by live connections.
  const tickLimiter = new SocketRateLimiter(SOCKET_RATE_LIMITS.tick.maxPerWindow, SOCKET_RATE_LIMITS.tick.windowMs);
  const changeSceneLimiter = new SocketRateLimiter(SOCKET_RATE_LIMITS.changeScene.maxPerWindow, SOCKET_RATE_LIMITS.changeScene.windowMs);
  const changeSkinLimiter = new SocketRateLimiter(SOCKET_RATE_LIMITS.changeSkin.maxPerWindow, SOCKET_RATE_LIMITS.changeSkin.windowMs);
  const joinSceneLimiter = new SocketRateLimiter(SOCKET_RATE_LIMITS.joinScene.maxPerWindow, SOCKET_RATE_LIMITS.joinScene.windowMs);
  const relayLimiter = new SocketRateLimiter(SOCKET_RATE_LIMITS.relay.maxPerWindow, SOCKET_RATE_LIMITS.relay.windowMs);

  // Scenes whose users changed since the last broadcast beat. Marking dirty (instead of
  // broadcasting unconditionally) means quiet rooms generate no traffic, and a burst of ticks
  // inside one beat coalesces into a single snapshot per room.
  const dirtyScenes = new Set<string>();
  const markDirty = (scene: string | undefined): void => {
    if (scene !== undefined) dirtyScenes.add(scene);
  };

  // Fixed-rate, room-scoped broadcast loop (issue #115). This replaces the old per-socket
  // store.subscribe fan-out, which re-filtered the whole user map and emitted for EVERY
  // subscriber on EVERY dispatch — N ticking clients cost N×tickrate dispatches × N
  // subscriptions × O(N) filtering. Here each dirty scene is filtered ONCE per beat, and each
  // member gets that snapshot minus its own record (the local avatar is driven by the
  // first-person camera, not by server echo).
  const broadcastTimer = setInterval(() => {
    for (const scene of dirtyScenes) {
      const members = io.sockets.adapter.rooms.get(sceneRoomOf(scene));
      if (members) {
        const snapshot = gameState.usersInScene(scene);
        for (const id of members) {
          const member = io.sockets.sockets.get(id);
          if (!member) continue;
          const others = Object.assign({}, snapshot);
          delete others[id];
          member.emit(EVENTS.USERS_UPDATED, others);
        }
      }
    }
    dirtyScenes.clear();
  }, BROADCAST_INTERVAL_MS);
  // Don't let the broadcast loop hold the process open once the server itself is closed.
  broadcastTimer.unref();

  // Emit to every connected socket whose user record is in `scene` — not just the ready ones
  // in the scene broadcast room — because removeUser must also reach clients that joined but
  // haven't acked ready yet. Only clients in the same room ever rendered the avatar, so only
  // they need the event (#57).
  const emitToScene = (scene: string, excludeId: string, event: string, payload: unknown): void => {
    for (const [id, peer] of io.sockets.sockets) {
      if (id === excludeId) continue;
      const user = gameState.getUser(id);
      if (user && user.scene === scene) peer.emit(event, payload);
    }
  };

  io.on(EVENTS.CONNECTION, (socket: GameSocket) => {
    console.log(styleText('yellow', `${socket.id} has connected`));
    socket.createdUser = false;

    // Membership in the per-scene broadcast room, granted on 'ready' (a client must not be
    // streamed usersUpdated before it has rendered the scene) and moved on changeScene.
    function joinSceneRoom (scene: string): void {
      socket.sceneRoom = sceneRoomOf(scene);
      socket.join(socket.sceneRoom);
    }
    function leaveSceneRoom (): void {
      if (socket.sceneRoom) {
        socket.leave(socket.sceneRoom);
        socket.sceneRoom = null;
      }
    }

    // Shared by logoutUser and disconnect: drop the user record, tell the room the avatar is
    // gone, and refresh that room's snapshot.
    function removeUserFromWorld (): void {
      const removed = gameState.removeUser(socket.id);
      if (!removed) return;
      emitToScene(removed.scene, socket.id, EVENTS.REMOVE_USER, socket.id);
      markDirty(removed.scene);
    }

    // joinScene is the single Stage 3 entry point (issue #69; handshake contract documented in
    //   shared/protocol.ts). The client sends its identity + room once (after login, once
    //   assets are ready), and the server creates the user and returns everything needed to
    //   render the room in one sceneState message. A single entry point also removes the old
    //   sceneLoad/createdUser ordering race.
    on(socket, EVENTS.JOIN_SCENE, validJoinScene, (user: unknown, scene: unknown) => {
      // validJoinScene guarantees these at runtime; re-narrow so the compiler knows too.
      // The joinScene `user` payload is still partially client-controlled (displayName/skin
      // fallbacks), but accountId MUST come from the Passport session on socket.request —
      // never from the payload — or any client can impersonate an account and kick its live
      // session (issue #167). Production wires express-session + passport onto Engine.IO in
      // server/index.ts so socket.request.user is the deserialized User when logged in.
      if (!isObject(user)) return;
      const sceneName = typeof scene === 'string' ? scene : undefined;
      socket.createdUser = true;
      // Session user is set by passport.session() (or test middleware); shape-check id only.
      const sessionUser = (socket.request as { user?: { id?: unknown, displayName?: unknown, skin?: unknown } }).user;
      const accountId = sessionUser && (typeof sessionUser.id === 'number' || typeof sessionUser.id === 'string')
        ? sessionUser.id
        : null;
      socket.accountId = accountId;
      // Single active session per account ("newest wins"): drop any prior socket for this
      // account before registering the new one (issue #30). Anonymous (no session user) are
      // exempt — and a spoofed client id can no longer drive eviction (#167).
      // When the new tab takes over an existing session in the SAME room, carry that session's
      // position/rotation forward so the user resumes exactly where they were standing instead of
      // respawning at a random point (new User() seeds a random x/z). A takeover into a DIFFERENT
      // room is left to that room's own spawn. Captured before disconnect, which deletes the record.
      let inheritedPosition: Pose | null = null;
      if (accountId != null) {
        // io.sockets.sockets is the socket registry (issue #116); Map iteration is safe under
        // the delete that disconnect() performs.
        for (const existing of io.sockets.sockets.values() as IterableIterator<GameSocket>) {
          if (existing.id !== socket.id && existing.accountId === accountId) {
            console.log(styleText('red', `Account ${accountId} already has session ${existing.id}; replacing with ${socket.id}`));
            const prev = gameState.getUser(existing.id);
            if (prev && prev.scene === sceneName) {
              inheritedPosition = {
                x: prev.x,
                y: prev.y,
                z: prev.z,
                xrot: prev.xrot,
                yrot: prev.yrot,
                zrot: prev.zrot
              };
            }
            existing.emit(EVENTS.SESSION_REPLACED);
            existing.disconnect(true);
          }
        }
      }
      // A re-join (reconnect, or login after logout) may land in a different scene; drop any
      // stale broadcast-room membership until the client acks ready again.
      leaveSceneRoom();
      // Prefer session identity fields when present; allow client displayName/skin only as
      // fallbacks for anonymous / incomplete sessions. NEVER trust client user.id for accountId.
      const displayName = (sessionUser && typeof sessionUser.displayName === 'string' && sessionUser.displayName) ||
        (typeof user.displayName === 'string' ? user.displayName : undefined);
      const skin = (sessionUser && typeof sessionUser.skin === 'string' && sessionUser.skin) ||
        (typeof user.skin === 'string' ? user.skin : undefined);
      const me = gameState.addUser(socket.id, {
        displayName,
        skin
      }, sceneName);
      // Apply the inherited position over the fresh random spawn before building sceneState, so
      // the takeover tab renders at the carried-forward location.
      if (inheritedPosition) gameState.updatePose(socket.id, inheritedPosition);
      markDirty(me.scene);
      socket.emit(EVENTS.SCENE_STATE, {
        you: me,
        others: gameState.peersOf(socket.id),
        tickRate: TICK_RATE
      });
    }, joinSceneLimiter);

    // ready: the client has rendered the scene and wants live updates. Join the scene's
    //   broadcast room so the fixed-rate loop above starts including this socket. Collapses the
    //   old haveGottenOthers + readyToReceiveUpdates pair into one ack (#69).
    on(socket, EVENTS.READY, null, () => {
      const me = gameState.getUser(socket.id);
      if (me) joinSceneRoom(me.scene);
    });

    // On each tick update from a client, fold the pose into GameState and mark the room dirty;
    //   the broadcast loop pushes the next snapshot on its own clock. The payload's id is
    //   ignored — the record is keyed on socket.id — and GameState.updatePose merges only
    //   finite numeric pose fields onto an existing record, so a tick can only ever move the
    //   sender's own avatar and can never create one (issues #56/#113). Rate-limited (#203).
    on(socket, EVENTS.TICK, isObject, (userData: unknown) => {
      if (!socket.createdUser || !isObject(userData)) return;
      const me = gameState.updatePose(socket.id, userData);
      if (me) markDirty(me.scene);
    }, tickLimiter);

    // Skin and scene changes used to ride on every tick, which is what made the tick an
    // injection surface (#113). They are explicit messages now, validated server-side and
    // applied to the sender's own record only. The skin whitelist is server-only state, so its
    // check composes here with the protocol-level shape check (#117). Rate-limited (#203).
    on(socket, EVENTS.CHANGE_SKIN, (skin: unknown) => typeof skin === 'string' && VALID_SKINS.has(skin), (skin: unknown) => {
      if (!socket.createdUser || typeof skin !== 'string') return;
      const me = gameState.setSkin(socket.id, skin);
      if (me) markDirty(me.scene);
    }, changeSkinLimiter);

    on(socket, EVENTS.CHANGE_SCENE, validRoom, (scene: unknown) => {
      if (!socket.createdUser || typeof scene !== 'string') return;
      const change = gameState.setScene(socket.id, scene);
      if (!change) return;
      // The old room's next snapshot no longer contains the mover (clients reconcile the
      // removal); the new room's next snapshot picks them up.
      markDirty(change.from);
      markDirty(scene);
      if (socket.sceneRoom) {
        leaveSceneRoom();
        joinSceneRoom(scene);
      }
    }, changeSceneLimiter);

    // Explicit logout: remove the avatar and leave the broadcast/chat rooms. Always clear
    // identity bookkeeping — including the Passport user stamped on the Engine.IO handshake
    // request — so a reused socket cannot re-bind the prior account on the next joinScene
    // (issue #199). The browser also disconnects and re-handshakes after logout; this server
    // clear is defense-in-depth if the connection is kept.
    on(socket, EVENTS.LOGOUT_USER, null, () => {
      if (socket.createdUser) {
        removeUserFromWorld();
        leaveChatRoom();
        leaveSceneRoom();
      }
      socket.createdUser = false;
      socket.accountId = null;
      // socket.request.user is set once at handshake by passport.session() and is never
      // refreshed for the life of the connection. Clear it so a subsequent joinScene on this
      // socket cannot impersonate the logged-out account.
      const req = socket.request as {
        user?: unknown
        session?: { passport?: { user?: unknown } }
      };
      req.user = undefined;
      if (req.session?.passport) {
        delete req.session.passport.user;
      }
    });

    // When a socket disconnects, remove the user record, broadcast 'removeUser' to the room,
    //   and tear down any WebRTC P2P pairings. socket.io itself has already dropped the socket
    //   from its registry and every room by the time this fires.
    on(socket, EVENTS.DISCONNECT, null, () => {
      removeUserFromWorld();
      // Drop rate-limit history so disconnected sockets do not leak map entries (#203).
      tickLimiter.forget(socket.id);
      changeSceneLimiter.forget(socket.id);
      changeSkinLimiter.forget(socket.id);
      joinSceneLimiter.forget(socket.id);
      relayLimiter.forget(socket.id);
      console.log(styleText('magenta', `${socket.id} has disconnected`));
      leaveChatRoom();
      console.log(`[${socket.id}] disconnected`);
    });

    // joinChatRoom joins a socket.io room and tells all clients in that room to establish a WebRTC
    //   connetions with the person entering the room. socket.io's own room registry replaces the
    //   old room reducer (issue #116): enumerate the existing members BEFORE joining so we don't
    //   pair the newcomer with itself.
    on(socket, EVENTS.JOIN_CHAT_ROOM, validRoom, function (room: unknown) {
      if (typeof room !== 'string') return;
      console.log(`[${socket.id}] join ${room}`);
      const peers = io.sockets.adapter.rooms.get(chatRoomOf(room)) || new Set<string>();
      for (const peerId of peers) {
        const peer = io.sockets.sockets.get(peerId);
        if (!peer) continue;
        peer.emit(EVENTS.ADD_PEER, { peer_id: socket.id, should_create_offer: false });
        socket.emit(EVENTS.ADD_PEER, { peer_id: peerId, should_create_offer: true });
      }
      socket.join(chatRoomOf(room));
      socket.currentChatRoom = room;
    });

    // leaveChatRoom leaves the current socket.io room and tells all clients to tear down WebRTC
    //   connections with the person leaving the room. Leave FIRST so the enumeration below is
    //   exactly "everyone else still in the room" — and on disconnect, where socket.io has
    //   already removed us from every room, leave() is a harmless no-op and the enumeration
    //   still yields the surviving peers.
    function leaveChatRoom (): void {
      const room = socket.currentChatRoom;
      if (room) {
        console.log(`[${socket.id}] leaveChatRoom ${room}`);
        socket.leave(chatRoomOf(room));
        const peers = io.sockets.adapter.rooms.get(chatRoomOf(room)) || new Set<string>();
        for (const peerId of peers) {
          const peer = io.sockets.sockets.get(peerId);
          if (!peer) continue;
          peer.emit(EVENTS.REMOVE_PEER, { peer_id: socket.id });
          socket.emit(EVENTS.REMOVE_PEER, { peer_id: peerId });
        }
        socket.currentChatRoom = null;
      } else {
        console.log('Not currently in room, so nothing to leave');
      }
    }
    on(socket, EVENTS.LEAVE_CHAT_ROOM, null, () => leaveChatRoom());

    // WebRTC signaling (ICE / SDP) is only meaningful between members of the same voice chat
    // room. peer_id is client-supplied, so before relaying verify the target is actually in
    // the sender's currentChatRoom — otherwise any connected socket could inject candidates
    // or session descriptions into an arbitrary peer (issue #168). Always stamp peer_id with
    // socket.id on the outbound emit so the source cannot be spoofed either.
    function canRelayTo (peerId: unknown): peerId is string {
      const room = socket.currentChatRoom;
      if (!room || typeof peerId !== 'string') return false;
      const members = io.sockets.adapter.rooms.get(chatRoomOf(room));
      return !!members?.has(peerId);
    }

    // If any user is an Ice Candidate, tells other users to set up a ICE connection with them.
    // Shared relayLimiter covers both ICE and SDP so total signaling volume is capped (#203).
    on(socket, EVENTS.RELAY_ICE_CANDIDATE, isObject, function (config: unknown) {
      if (!isObject(config)) return;
      const peerId = config.peer_id;
      const iceCandidate = config.ice_candidate;
      if (!canRelayTo(peerId)) return;
      console.log(`[${socket.id}] relaying ICE candidate to [${peerId}] ${iceCandidate}`);
      const peer = io.sockets.sockets.get(peerId);
      if (peer) peer.emit(EVENTS.ICE_CANDIDATE, { peer_id: socket.id, ice_candidate: iceCandidate });
    }, relayLimiter);

    // Send the answer back to the new user in order to complete the handshake
    on(socket, EVENTS.RELAY_SESSION_DESCRIPTION, isObject, function (config: unknown) {
      if (!isObject(config)) return;
      const peerId = config.peer_id;
      const sessionDescription = config.session_description;
      if (!canRelayTo(peerId)) return;
      console.log(`[${socket.id}] relaying session description to [${peerId}] ${sessionDescription}`);
      const peer = io.sockets.sockets.get(peerId);
      if (peer) peer.emit(EVENTS.SESSION_DESCRIPTION, { peer_id: socket.id, session_description: sessionDescription });
    }, relayLimiter);
  });
}
