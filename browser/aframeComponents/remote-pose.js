import AFRAME from 'aframe';
import { samplePose } from '../pose-buffer';

// Renders a remote avatar entity from its snapshot-interpolation buffer (issue #125).
// AvatarManager attaches this to every remote head and body and pushes usersUpdated snapshots
// into browser/pose-buffer.js; this tick() samples the buffer every rendered frame ~100ms in
// the past and interpolates, so remote avatars glide at the local framerate instead of
// stepping at the 20 Hz broadcast rate (#115). Writes go straight to object3D — a per-frame
// setAttribute would round-trip A-Frame's attribute layer for nothing.
//
// part=head applies full rotation; part=body only yaw with the head's x/z tilt zeroed (bodies
// don't pitch/roll), matching how the old direct-write reconciliation styled each entity.
export default AFRAME.registerComponent('remote-pose', {
  schema: {
    userId: { type: 'string' },
    part: { type: 'string', default: 'head' }
  },
  tick () {
    const pose = samplePose(this.data.userId);
    if (!pose) return;
    const object3D = this.el.object3D;
    const degToRad = THREE.MathUtils.degToRad;
    object3D.position.set(pose.x, pose.y, pose.z);
    if (this.data.part === 'body') {
      object3D.rotation.set(0, degToRad(pose.yrot), 0);
    } else {
      object3D.rotation.set(degToRad(pose.xrot), degToRad(pose.yrot), degToRad(pose.zrot));
    }
  }
});
