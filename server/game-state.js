const { User } = require('./utils');

// The only fields a position tick may update (issue #113). displayName/skin/scene must never
// ride in on a tick: skin/scene changes are their own explicit methods below.
const POSE_FIELDS = ['x', 'y', 'z', 'xrot', 'yrot', 'zrot'];

// Durable multiplayer domain state: plain-data user records keyed by socket id (issue #116).
// This replaces the server-side Redux store. Transport state — which sockets exist and who is
// in which room — is NOT held here; socket.io's own registries (`io.sockets.sockets` and
// `io.sockets.adapter.rooms`) are the single source of truth for that, so no live handles ever
// end up inside application state.
class GameState {
  constructor () {
    this.users = new Map();
  }

  // Create (or replace) the user record for a socket. Creation is joinScene's job alone;
  // every other method here is update-only.
  addUser (id, { displayName, skin }, scene) {
    const user = new User(id, displayName, skin);
    if (scene) user.scene = scene;
    this.users.set(id, user);
    return user;
  }

  getUser (id) {
    return this.users.get(id);
  }

  // Pose-only merge: only the six whitelisted pose fields, only finite numbers, and only onto
  // an EXISTING record — a tick must never create a user (issues #56/#113). The old immutable
  // mergeIn auto-vivified missing ids, which is how post-restart ticks materialized ghost
  // "John" records; enforcing "update, never create" in this one method removes that footgun.
  updatePose (id, data) {
    const user = this.users.get(id);
    if (!user) return null;
    for (const field of POSE_FIELDS) {
      if (Number.isFinite(data[field])) user[field] = data[field];
    }
    return user;
  }

  setSkin (id, skin) {
    const user = this.users.get(id);
    if (!user) return null;
    user.skin = skin;
    return user;
  }

  // Move a user to another scene. Returns { user, from } so the caller can refresh both the
  // old and the new room, or null if the user doesn't exist.
  setScene (id, scene) {
    const user = this.users.get(id);
    if (!user) return null;
    const from = user.scene;
    user.scene = scene;
    return { user, from };
  }

  // Delete the record and return it (the caller needs the scene to notify that room).
  removeUser (id) {
    const user = this.users.get(id);
    this.users.delete(id);
    return user;
  }

  // ALL users in `scene`, keyed by id — one filter pass per room per broadcast (issue #115).
  usersInScene (scene) {
    const result = {};
    for (const [id, user] of this.users) {
      if (user.scene === scene) result[id] = user;
    }
    return result;
  }

  // The other users in the same scene as `id` (excluding that user), for the sceneState reply.
  // Filtering server-side keeps cross-room position data off the wire entirely (issue #58).
  // Two users who haven't reported a scene yet both have '' and are treated as sharing the
  // same (empty) not-yet-placed room.
  peersOf (id) {
    const self = this.users.get(id);
    if (!self) return {};
    const peers = this.usersInScene(self.scene);
    delete peers[id];
    return peers;
  }
}

module.exports = GameState;
