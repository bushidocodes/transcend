// Snapshot interpolation buffers for remote avatars (issue #125). The server broadcasts room
// snapshots on a fixed 20 Hz clock (#115) while headsets render at 60-90+ fps, so writing each
// snapshot straight to the entity makes remote avatars hold a pose for several frames and then
// teleport. Instead, usersUpdated snapshots are buffered here (AvatarManager pushes them), and
// the remote-pose A-Frame component samples the buffer every rendered frame at a fixed
// interval in the past — far enough back that two snapshots normally bracket the render time,
// so every frame gets a fresh in-between pose.
//
// Pure data + math on purpose: no DOM, no A-Frame — the component and AvatarManager import
// this, and it unit-tests in plain Node.

import type { Pose } from '../shared/protocol.ts';

// How far in the past remote avatars are rendered: ~2 broadcast beats, so one late or lost
// snapshot doesn't stall interpolation. Raising the server rate doesn't require touching this;
// it just tightens the brackets.
export const INTERP_DELAY_MS = 100;

// Snapshots kept per user. The sampler only ever needs the pair bracketing (now - delay);
// a few extra absorb arrival jitter.
const MAX_SNAPSHOTS = 5;

export const POSE_FIELDS = ['x', 'y', 'z', 'xrot', 'yrot', 'zrot'] as const;

export type PoseField = (typeof POSE_FIELDS)[number];

// One buffered pose plus the time it was recorded at.
export interface PoseSnapshot extends Pose {
  t: number;
}

// id -> array of { t, x, y, z, xrot, yrot, zrot }, oldest first.
const buffers = new Map<string, PoseSnapshot[]>();

// Record one snapshot for a user. Non-finite fields (defensive; the server sends full
// records) inherit the previous snapshot's value, or 0 with nothing to inherit.
export function pushPose (id: string, user: Partial<Record<PoseField, unknown>>, t: number = performance.now()): void {
  let buf = buffers.get(id);
  if (!buf) {
    buf = [];
    buffers.set(id, buf);
  }
  const prev = buf[buf.length - 1];
  const snapshot = { t } as PoseSnapshot;
  for (const field of POSE_FIELDS) {
    const value = user[field];
    snapshot[field] = typeof value === 'number' && Number.isFinite(value) ? value : (prev ? prev[field] : 0);
  }
  buf.push(snapshot);
  while (buf.length > MAX_SNAPSHOTS) buf.shift();
}

// Linear interpolation for the rotation fields along the shortest arc, so a yaw crossing the
// 359°→1° seam turns 2° rather than spinning 358° the long way round.
function lerpAngle (a: number, b: number, f: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return a + delta * f;
}

// The pose to render for `id` right now: the buffer sampled at (now - INTERP_DELAY_MS).
// Before the first snapshot -> hold the first (a fresh joiner stands at its spawn until the
// stream begins). Past the last -> hold the last, never extrapolate (a stopped peer freezes
// in place; extrapolation overshoots on direction changes). Returns null with no data.
export function samplePose (id: string, now: number = performance.now()): PoseSnapshot | null {
  const buf = buffers.get(id);
  if (!buf || buf.length === 0) return null;
  const target = now - INTERP_DELAY_MS;
  if (target <= buf[0].t) return buf[0];
  const last = buf[buf.length - 1];
  if (target >= last.t) return last;
  // Find the bracketing pair. The buffer is tiny (<= MAX_SNAPSHOTS), so a linear scan is fine.
  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1];
    const b = buf[i];
    if (a.t <= target && target <= b.t) {
      const f = (target - a.t) / (b.t - a.t || 1);
      return {
        t: target,
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        z: a.z + (b.z - a.z) * f,
        xrot: lerpAngle(a.xrot, b.xrot, f),
        yrot: lerpAngle(a.yrot, b.yrot, f),
        zrot: lerpAngle(a.zrot, b.zrot, f)
      };
    }
  }
  return last;
}

// Forget a user (their avatar was removed).
export function dropPose (id: string): void {
  buffers.delete(id);
}
