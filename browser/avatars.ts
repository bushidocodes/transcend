// AvatarManager (issue #118): the single owner of avatar entities on the A-Frame scene.
//
// Avatars are deliberately imperative — per-frame position updates through React
// reconciliation would fight A-Frame — but before this module the imperative code had no
// owner: browser/socket.ts and browser/utils.ts each did their own getElementById /
// setAttribute / remove reconciliation, which is the bug class behind ghost and duplicate
// avatars (#56, #76, #49, #50). All avatar DOM mutation now goes through this module's
// internal registry; nothing outside it looks avatars up in the DOM.
//
// Terminology: the LOCAL avatar is the first-person player (a head entity that carries the
// camera/controls rig — see addFirstPersonProperties in browser/utils.ts — plus the separate
// #mutebutton entity). REMOTE avatars are everyone else: a floating head plus a body entity.

import { pushPose, dropPose } from './pose-buffer.ts';
import type { Pose } from '../shared/protocol.ts';

// What this module needs of a user record: a pose plus identity/appearance. SceneUser
// (shared/protocol.ts) satisfies it; `scene` is deliberately not required — the payloads this
// module receives are already room-scoped, so it never inspects the field.
export interface AvatarUser extends Pose {
  id: string;
  displayName?: string;
  skin?: string;
}

// id -> { head, body } for every remote avatar currently rendered.
const remotes = new Map<string, { head: HTMLElement, body: HTMLElement }>();
// The first-person avatar, or null before joinScene / after teardown.
let local: { id: string, head: HTMLElement } | null = null;

const DEFAULT_SKIN = '3djesus';

const sceneEl = () => document.getElementById('scene');

const destroy = (el: Element | null) => {
  if (el && el.parentNode) el.parentNode.removeChild(el);
};

function createHead (user: AvatarUser): HTMLElement {
  const scene = sceneEl()!;
  const head = document.createElement('a-minecraft');
  // Just in case a user doesn't have a skin associated with their user, use the default
  const skin = user.skin || DEFAULT_SKIN;
  head.setAttribute('skin', skin);
  scene.appendChild(head);
  head.setAttribute('id', user.id);
  // Only set the nametag when displayName is a non-empty string — otherwise A-Frame /
  // the minecraft component stringifies undefined to the literal "undefined" (issue #173).
  if (user.displayName) {
    head.setAttribute('minecraft-nickname', user.displayName);
  }
  head.setAttribute('minecraft', `skinUrl: ../../images/${skin}.png;`);
  head.setAttribute('position', `${user.x} ${user.y} ${user.z}`);
  head.setAttribute('rotation', `${user.xrot} ${user.yrot} ${user.zrot}`);
  return head;
}

function createBody (user: AvatarUser): HTMLElement {
  const scene = sceneEl()!;
  const body = document.createElement('a-minecraft');
  const skin = user.skin || DEFAULT_SKIN;
  scene.appendChild(body);
  body.setAttribute('skin', skin);
  body.setAttribute('id', `${user.id}-body`);
  body.setAttribute('minecraft', `skinUrl: ../../images/${skin}.png;  component: body; heightMeter: 0.4`);
  body.setAttribute('position', `${user.x} ${user.y} ${user.z}`);
  body.setAttribute('rotation', `0 ${user.yrot} 0`);
  return body;
}

function addRemote (user: AvatarUser): void {
  const head = createHead(user);
  const body = createBody(user);
  // Remote entities render from the snapshot-interpolation buffer every frame (issue #125);
  // the pose attributes set at creation are just the spawn placement until the stream starts.
  // The component is registered via socket.ts (this module stays A-Frame-free for its tests).
  head.setAttribute('remote-pose', `userId: ${user.id}; part: head`);
  body.setAttribute('remote-pose', `userId: ${user.id}; part: body`);
  pushPose(user.id, user);
  remotes.set(user.id, { head, body });
}

// Render (or re-render) the local first-person avatar and return its head entity so the
// caller can attach the camera/controls rig. Idempotent: a re-join (reconnect, session
// takeover reclaim) replaces any previous local avatar instead of stacking a duplicate.
export function setLocal (user: AvatarUser): HTMLElement {
  removeLocal();
  const head = createHead(user);
  local = { id: user.id, head };
  return head;
}

// Tear down the local avatar and its rig extras (the #mutebutton entity created by
// addFirstPersonProperties). Safe to call when there is none.
export function removeLocal (): void {
  let head: Element | null = local && local.head;
  // Fallback for teardown before setLocal ever ran under this manager (e.g. a reconnect
  // racing the first sceneState): the local head is the one carrying publish-location.
  if (!head) head = document.querySelector('a-minecraft[publish-location]');
  destroy(head);
  destroy(document.getElementById('mutebutton'));
  local = null;
}

// Live skin change for the local avatar (the ChangingRoom mannequins, issue #113).
export function setLocalSkin (skin: string): void {
  if (!local) return;
  local.head.setAttribute('skin', skin);
  local.head.setAttribute('minecraft', `skinUrl: ../../images/${skin}.png;`);
}

// Remove one remote avatar (the server's removeUser event: disconnect/logout, #57).
export function remove (id: string): void {
  const entry = remotes.get(id);
  if (!entry) return;
  console.log('Removing user ', id);
  destroy(entry.head);
  destroy(entry.body);
  remotes.delete(id);
  dropPose(id);
}

// Reconcile the remote avatars against a room-scoped `id -> user` payload (sceneState.others
// or a usersUpdated snapshot, #58): add avatars that are new, redraw on skin change, update
// pose otherwise, and drop everyone absent from the payload (they left the room, or we did).
// The local avatar is never touched — it is camera-driven. Room broadcasts may still include
// the local id in the payload after #200's O(M) room emit; the client skips self here.
export function sync (users?: Record<string, AvatarUser> | null): void {
  const map = users || {};
  Object.keys(map).forEach(id => {
    if (local && id === local.id) return;
    const user = map[id];
    const entry = remotes.get(id);
    if (!entry) {
      addRemote(user);
    } else if (entry.head.getAttribute('skin') !== (user.skin || DEFAULT_SKIN)) {
      // Skin changed: the minecraft component builds its mesh from skinUrl at init, so
      // remove and redraw rather than mutating in place.
      remove(id);
      addRemote(user);
    } else {
      // Pose updates only feed the interpolation buffer (issue #125); the remote-pose
      // component renders from it every frame, ~100ms in the past, gliding between
      // snapshots instead of stepping at the broadcast rate.
      pushPose(id, user);
    }
  });
  for (const id of [...remotes.keys()]) {
    if (!(id in map)) remove(id);
  }
}
