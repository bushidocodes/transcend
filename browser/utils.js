// putUserOnDOM renders a user's avatar head. The server is now authoritative for room
//   membership — it only sends users in the caller's room (issue #58) — so there is no longer
//   a client-side scene guard here (the earlier #74/#87 isInCurrentScene check is obsolete).
//   This also renders the local avatar (via renderAvatar), whose scene isn't set yet.
export function putUserOnDOM (user) {
  console.log(`Putting user ${user} on the DOM`);
  const scene = document.getElementById('scene');
  const head = document.createElement('a-minecraft');
  // Just in case a user doesn't have a skin associated with their user, use 3djesus
  const skin = user.skin || '3djesus';
  head.setAttribute('skin', skin);
  scene.appendChild(head);
  head.setAttribute('id', user.id);
  head.setAttribute('minecraft-nickname', user.displayName);
  head.setAttribute('minecraft', `skinUrl: ../../images/${skin}.png;`);
  head.setAttribute('position', `${user.x} ${user.y} ${user.z}`);
  head.setAttribute('rotation', `${user.xrot} ${user.yrot} ${user.zrot}`);
  return head;
}

export function putUserBodyOnDOM (user) {
  // No scene guard needed — the server only sends same-room users (issue #58).
  const scene = document.getElementById('scene');
  const body = document.createElement('a-minecraft');
  const skin = user.skin || '3djesus';
  scene.appendChild(body);
  body.setAttribute('skin', skin);
  body.setAttribute('id', `${user.id}-body`);
  body.setAttribute('minecraft', `skinUrl: ../../images/${skin}.png;  component: body; heightMeter: 0.4`);
  body.setAttribute('position', `${user.x} ${user.y} ${user.z}`);
  body.setAttribute('rotation', `0 ${user.yrot} 0`);
}

export function changeUserSkin (skin) {
  const avatarHead = document.getElementById(window.socket.id);
  // Just stuff the shortform skin name on the DOM to emit in publish-location
  // I consider this a 'hack' until we change how we update user locations
  avatarHead.setAttribute('skin', skin);
  avatarHead.setAttribute('minecraft', `skinUrl: ../../images/${skin}.png;`);
  // Commented out because we're just floating heads
  // const avatarBody = document.getElementById(`${window.socket.id}-body`);
  // avatarBody.setAttribute('minecraft', `skinUrl: ../../images/${skin}.png;  component: body; heightMeter: 0.4`);
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
  mutebutton.setAttribute('id', `mutebutton`);
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
