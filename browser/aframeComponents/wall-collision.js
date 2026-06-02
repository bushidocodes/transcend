import AFRAME from 'aframe';

// Keeps the player rig inside the room's axis-aligned bounding box (issue #55).
//
// Every room — the Lobby and all sub-rooms (Beth/Joey/Sean/Yoonah, the basement,
// the catroom) — is rendered by Room.js as a single floorWidth x floorHeight box
// (currently 50x50, walls at +/- floorWidth/2). Movement is A-Frame's built-in
// wasd-controls, which mutates the rig's position with no bounds check, so the
// player can walk straight through the walls.
//
// Because the play area is axis-aligned, full physics is unnecessary: each tick we
// clamp the rig's x/z to the interior half-extents minus a small margin (so the
// camera doesn't poke through the wall plane). wasd-controls writes object3D.position
// during its own tick; this component runs afterward and corrects any move that would
// cross a wall, which reads as the player sliding along the wall rather than stopping
// dead. y is deliberately left untouched so vertical motion / teleporters still work.
//
// Bounds are configurable so non-50x50 rooms added later Just Work by passing the
// matching half-extents; defaults match the current Room.js dimensions.
export default AFRAME.registerComponent('wall-collision', {
  schema: {
    halfWidth: { type: 'number', default: 25 }, // floorWidth / 2
    halfDepth: { type: 'number', default: 25 }, // floorHeight / 2
    margin: { type: 'number', default: 0.5 }     // keep the camera off the wall plane
  },
  tick: function () {
    const pos = this.el.object3D.position;
    const maxX = this.data.halfWidth - this.data.margin;
    const maxZ = this.data.halfDepth - this.data.margin;
    if (pos.x > maxX) pos.x = maxX;
    else if (pos.x < -maxX) pos.x = -maxX;
    if (pos.z > maxZ) pos.z = maxZ;
    else if (pos.z < -maxZ) pos.z = -maxZ;
  }
});
