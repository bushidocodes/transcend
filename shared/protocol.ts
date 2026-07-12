// The socket.io wire protocol — every event name and payload shape, defined once and imported
// by BOTH sides of the connection (issue #117). The server imports this directly (Node runs
// the .ts via type stripping); browser code imports it and esbuild bundles it. Before this
// module, each event name existed only as string literals duplicated across server/socket.ts
// and four browser files, so a typo or a rename on one side was a silent runtime no-op (the
// event simply never fired). Referencing EVENTS.* instead makes a typo a compile error and a
// rename a one-line edit.
//
// This header is also the single home for the handshake contract (issue #69), previously
// described in comments duplicated on both sides:
//
//   1. client emits  JOIN_SCENE (user, scene)   — identity + room, once assets are ready
//   2. server emits  SCENE_STATE                — { you, others, tickRate }: everything needed
//                                                 to render the room in one message
//   3. client emits  READY                      — scene rendered; start streaming
//   4. server emits  USERS_UPDATED              — room-scoped full scene snapshot once per beat
//                                                 (#115/#200); clients ignore their own id
//                                                 until disconnect, logout, or session replace

/* ---------- payload shapes ----------
   The wire types, shared so the server's game state and the browser's avatar/pose code agree
   on field names by construction rather than by convention. */

// { x, y, z, xrot, yrot, zrot } — the six (and only six) fields a TICK may carry (#113).
export interface Pose {
  x: number;
  y: number;
  z: number;
  xrot: number;
  yrot: number;
  zrot: number;
}

// The identity the client sends with JOIN_SCENE: its auth record. `id` is the database id for
// logged-in users; displayName/skin are what the avatar renders as.
export interface AuthUser {
  id?: number | string;
  displayName?: string;
  skin?: string;
}

// A user snapshot as the server broadcasts it: identity + pose + which scene it is in.
// `id` is the owning socket's id, not the database id.
export interface SceneUser extends Pose {
  id: string;
  displayName?: string;
  skin?: string;
  scene: string;
}

// id -> user maps carried by SCENE_STATE.others and USERS_UPDATED.
export type UsersMap = Record<string, SceneUser>;

// The SCENE_STATE reply: everything the client needs to render the room in one message.
export interface SceneState {
  you: SceneUser;
  others: UsersMap;
  tickRate: number;
}

export const EVENTS = {
  /* ---------- client -> server ---------- */

  // (user, scene): user is the auth record (AuthUser), scene the room name.
  // The single Stage-3 entry point (#69); creates/replaces the sender's user record.
  JOIN_SCENE: 'joinScene',
  // (no payload): ack that the scene is rendered; joins the sender to its room's broadcast.
  READY: 'ready',
  // (pose): Pose — position update for the SENDER's own avatar. Identity comes from the
  // socket, never the payload; non-pose fields are ignored (#113).
  TICK: 'tick',
  // (skin): a skin name; must be in the server-side whitelist (server/validSkins.ts, #79).
  CHANGE_SKIN: 'changeSkin',
  // (scene): the room name the sender is moving to.
  CHANGE_SCENE: 'changeScene',
  // (no payload): remove the avatar but keep the socket, so a later login can re-join (#67).
  LOGOUT_USER: 'logoutUser',
  // (room): join the WebRTC voice room; the server introduces the newcomer to each member.
  JOIN_CHAT_ROOM: 'joinChatRoom',
  // (no payload): leave the current voice room and tear down its peer pairings.
  LEAVE_CHAT_ROOM: 'leaveChatRoom',
  // ({ peer_id, ice_candidate }): relay an ICE candidate to one peer during WebRTC setup.
  RELAY_ICE_CANDIDATE: 'relayICECandidate',
  // ({ peer_id, session_description }): relay an SDP offer/answer to one peer.
  RELAY_SESSION_DESCRIPTION: 'relaySessionDescription',

  /* ---------- server -> client ---------- */

  // SceneState: reply to JOIN_SCENE. `you` is the sender's own record, `others` maps
  // id -> user for everyone already in the room (#58), `tickRate` is the animation-frame
  // divisor at which the client should publish TICKs (#59/#69).
  SCENE_STATE: 'sceneState',
  // (users): UsersMap — id -> user snapshot of the OTHER users in the receiver's room, sent at
  // a fixed server rate whenever the room changed (#115). Absence of a previously-seen id means
  // that user left the room; the client reconciles removals from it.
  USERS_UPDATED: 'usersUpdated',
  // (userId): that user's avatar is gone (disconnect/logout); sent to their room only (#57).
  REMOVE_USER: 'removeUser',
  // (no payload): this account logged in elsewhere and this socket is about to be dropped —
  // the tab must stop acting like a live session ("newest wins", #30).
  SESSION_REPLACED: 'sessionReplaced',
  // ({ peer_id, should_create_offer }): open a WebRTC connection to peer_id; the side told
  // should_create_offer=true initiates.
  ADD_PEER: 'addPeer',
  // ({ peer_id }): tear down the WebRTC connection to peer_id (they left the voice room).
  REMOVE_PEER: 'removePeer',
  // ({ peer_id, ice_candidate }): relayed ICE candidate from peer_id.
  ICE_CANDIDATE: 'iceCandidate',
  // ({ peer_id, session_description }): relayed SDP offer/answer from peer_id.
  SESSION_DESCRIPTION: 'sessionDescription',

  /* ---------- socket.io built-ins (not app-defined, listed so handler code has no bare
     event-name literals; never rename these — socket.io owns them) ---------- */

  CONNECTION: 'connection',
  CONNECT: 'connect',
  DISCONNECT: 'disconnect'
} as const;

/* ---------- payload validators (issue #112) ----------
   The protocol-level shape checks the server runs before dispatching a handler; they live here
   so an event's shape is defined next to its name. Semantic checks that need server-only state
   (e.g. the CHANGE_SKIN whitelist) stay in the server and compose with these. */

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// JOIN_SCENE: `user` must be an object — the handler dereferences it — and a scene must be a
// string, since it's used as a room key (a missing scene means "not yet placed").
export const validJoinScene = (user: unknown, scene: unknown): boolean =>
  isObject(user) && (scene == null || typeof scene === 'string');

// CHANGE_SCENE / JOIN_CHAT_ROOM: the payload is used as a room key.
export const validRoom = (room: unknown): room is string => typeof room === 'string';
