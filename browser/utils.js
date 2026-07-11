import { EVENTS } from '../shared/protocol';
import { setLocalSkin } from './avatars';
import { getSocket } from './socket-holder';

// Avatar entity creation/reconciliation lives in browser/avatars.js (AvatarManager, #118);
// this module keeps the first-person rig wiring and misc scene helpers.

export function changeUserSkin (skin) {
  // The local avatar's DOM is owned by AvatarManager (#118).
  setLocalSkin(skin);
  // Tell the server (and thus everyone else in the room) about the new skin. Skins used to
  // piggyback on every position tick; the server no longer merges skin from ticks (issue
  // #113), so this is the one live-update path peers see.
  getSocket().emit(EVENTS.CHANGE_SKIN, skin);
  fetch('/api/auth/skin', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skin })
  }).catch(() => {});
}

export function addFirstPersonProperties (avatar, user) {
  console.log('avatar: ', avatar);
  const scene = document.getElementById('scene');
  const mutebutton = document.createElement('a-entity');
  scene.appendChild(mutebutton);
  mutebutton.setAttribute('geometry', 'primitive: box;  width: .4; height: 0.01; depth: .4');
  mutebutton.setAttribute('id', 'mutebutton');
  // transparent:true is required so the mic PNG's transparent background shows the floor through
  // it rather than an opaque tile. A-Frame 0.4 auto-enabled this for alpha textures; 1.x does not.
  mutebutton.setAttribute('material', 'src: /img/microphone-unmute.png; transparent: true');
  mutebutton.setAttribute('position', `0 0.1 ${user.z - 1}`);
  mutebutton.setAttribute('rotation', '0 0 0');
  mutebutton.setAttribute('mute-self', false);

  avatar.setAttribute('publish-location', true);
  avatar.setAttribute('camera', true);
  // A-Frame 1.x built-in look-controls replaces the old custom fps-look-controls (which used
  // the removed THREE.VRControls). pointerLockEnabled gives the FPS-style mouse capture; the
  // component also drives HMD/WebXR head pose automatically.
  avatar.setAttribute('look-controls', 'pointerLockEnabled: true');
  // Seed the initial head facing from the inherited rotation. look-controls drives the camera
  // orientation every frame from its internal yaw/pitch objects (both start at 0), overriding the
  // entity's `rotation` attribute — so on a session takeover the head would otherwise always snap
  // to facing forward even though position carried over. Seed those objects so the user resumes
  // looking the same direction; publish-location then reports the matching yrot/xrot to peers.
  const DEG2RAD = Math.PI / 180;
  const seedLook = () => {
    const lc = avatar.components && avatar.components['look-controls'];
    if (!lc || !lc.yawObject) return false;
    lc.yawObject.rotation.y = (user.yrot || 0) * DEG2RAD;
    lc.pitchObject.rotation.x = (user.xrot || 0) * DEG2RAD;
    return true;
  };
  // The component inits synchronously if the entity has already loaded; otherwise wait for it.
  if (!seedLook()) avatar.addEventListener('loaded', seedLook, { once: true });
  avatar.setAttribute('wasd-controls', 'acceleration: 100');
  // Keep the player inside the room box so wasd-controls can't walk through the walls
  // (issue #55). Set after wasd-controls so this component's tick runs afterward and
  // corrects the move. Defaults match Room.js's 50x50 box (half-extent 25).
  avatar.setAttribute('wall-collision', 'halfWidth: 25; halfDepth: 25; margin: 0.5');

  // Add and append the cursor to the player's avatar
  // The cursor is represented by a tiny ring 1/10 of a meter in front of the player
  // The cursor casts a ray along the vector from the player to the cursor
  // The cursor emits click events and fuse events (automatically emitting click after keeping cursor on something)
  const cursor = document.createElement('a-entity');
  avatar.appendChild(cursor);
  cursor.setAttribute('cursor', 'fuse: true; fuseTimeout: 1500');
  // A-Frame 1.x: the cursor's click/mouseenter/mouseleave events (used by href, wearable-skin,
  // and mute-self) only fire when a raycaster shares the entity. Scope it to interactive
  // entities so the ray ignores walls/floor and doesn't block fuse on the orbs.
  cursor.setAttribute('raycaster', 'objects: [href], [wearable-skin], [mute-self]');
  cursor.setAttribute('position', '0 0 -0.1');
  cursor.setAttribute('material', 'color: cyan; shader: flat');
  cursor.setAttribute('geometry', 'primitive: ring; radiusOuter: 0.007; radiusInner: 0.005;');
}

// creates an array of x and z coordinates that can be mapped over to create rows of chairs
export function createArray (num) {
  const arr = [];
  for (let i = 1; i <= Math.abs(num); i++) {
    for (let j = 1; j <= Math.abs(num); j++) {
      if (num > 0) arr.push([i, j]);
      else arr.push([i * -1, j]);
    }
  }
  return arr;
}
