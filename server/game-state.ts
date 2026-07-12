import { User } from './utils.ts';
import type { AuthUser, Pose } from '../shared/protocol.ts';
import { POSE_XZ_MIN, POSE_XZ_MAX, POSE_Y_MIN, POSE_Y_MAX } from '../shared/protocol.ts';

// The only fields a position tick may update (issue #113). displayName/skin/scene must never
// ride in on a tick: skin/scene changes are their own explicit methods below.
const POSE_FIELDS = ['x', 'y', 'z', 'xrot', 'yrot', 'zrot'] as const;

// Clamp finite pose numbers into world bounds so a client cannot teleport peers to extreme
// coordinates (issue #232). Rotations stay unbounded (they wrap naturally in render).
function clampPoseValue(field: (typeof POSE_FIELDS)[number], value: number): number {
  if (field === 'x' || field === 'z') {
    return Math.min(POSE_XZ_MAX, Math.max(POSE_XZ_MIN, value));
  }
  if (field === 'y') {
    return Math.min(POSE_Y_MAX, Math.max(POSE_Y_MIN, value));
  }
  return value;
}

// Durable multiplayer domain state: plain-data user records keyed by socket id (issue #116).
// This replaces the server-side Redux store. Transport state — which sockets exist and who is
// in which room — is NOT held here; socket.io's own registries (`io.sockets.sockets` and
// `io.sockets.adapter.rooms`) are the single source of truth for that, so no live handles ever
// end up inside application state.
export default class GameState {
  users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  // Create (or replace) the user record for a socket. Creation is joinScene's job alone;
  // every other method here is update-only.
  //
  // Missing/empty scene must NOT leave the user in the shared '' room (issue #204): every
  // unplaced user would then share peersOf/usersInScene and leak identity + pose. Assign a
  // private `__unplaced:<id>` key instead so unplaced users never group with strangers.
  addUser(id: string, { displayName, skin }: AuthUser, scene?: string): User {
    const user = new User(id, displayName ?? undefined, skin ?? undefined);
    if (scene) user.scene = scene;
    else user.scene = `__unplaced:${id}`;
    this.users.set(id, user);
    return user;
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  // Pose-only merge: only the six whitelisted pose fields, only finite numbers, and only onto
  // an EXISTING record — a tick must never create a user (issues #56/#113). The old immutable
  // mergeIn auto-vivified missing ids, which is how post-restart ticks materialized ghost
  // "John" records; enforcing "update, never create" in this one method removes that footgun.
  updatePose(id: string, data: Partial<Pose> | Record<string, unknown>): User | null {
    const user = this.users.get(id);
    if (!user) return null;
    for (const field of POSE_FIELDS) {
      const value = data[field];
      if (Number.isFinite(value)) user[field] = clampPoseValue(field, value as number);
    }
    return user;
  }

  setSkin(id: string, skin: string): User | null {
    const user = this.users.get(id);
    if (!user) return null;
    user.skin = skin;
    return user;
  }

  // Move a user to another scene. Returns { user, from } so the caller can refresh both the
  // old and the new room, or null if the user doesn't exist.
  setScene(id: string, scene: string): { user: User; from: string } | null {
    const user = this.users.get(id);
    if (!user) return null;
    const from = user.scene;
    user.scene = scene;
    return { user, from };
  }

  // Delete the record and return it (the caller needs the scene to notify that room).
  removeUser(id: string): User | undefined {
    const user = this.users.get(id);
    this.users.delete(id);
    return user;
  }

  // ALL users in `scene`, keyed by id — one filter pass per room per broadcast (issue #115).
  usersInScene(scene: string): Record<string, User> {
    const result: Record<string, User> = {};
    for (const [id, user] of this.users) {
      if (user.scene === scene) result[id] = user;
    }
    return result;
  }

  // The other users in the same scene as `id` (excluding that user), for the sceneState reply.
  // Filtering server-side keeps cross-room position data off the wire entirely (issue #58).
  // Unplaced users get a unique `__unplaced:<id>` scene from addUser (issue #204), so they
  // never share a room with other unplaced users — peersOf is empty until they join a real scene.
  peersOf(id: string): Record<string, User> {
    const self = this.users.get(id);
    if (!self) return {};
    // Defence in depth: never treat the legacy empty string as a shared room.
    if (self.scene === '') return {};
    const peers = this.usersInScene(self.scene);
    delete peers[id];
    return peers;
  }
}
