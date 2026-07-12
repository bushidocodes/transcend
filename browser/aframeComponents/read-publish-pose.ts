// Pure helper used by publish-location's tick (issue #224). Kept out of the A-Frame
// component module so unit tests can import it without loading A-Frame.
//
// During logout teardown the local avatar entity can be mid-destroy while tick still
// fires (tickRate may still be non-null). getAttribute('position'|'rotation') can then
// return null/undefined; dereferencing .x/.y/.z throws outside React and blanks the tab.

export interface PublishPose {
  x: number;
  y: number;
  z: number;
  xrot: number;
  yrot: number;
  zrot: number;
}

/** Minimal element surface the tick needs — avoids pulling in A-Frame types in tests. */
export interface PoseElement {
  isConnected?: boolean;
  getAttribute(name: string): unknown;
}

function isVec3(value: unknown): value is { x: number; y: number; z: number } {
  if (!value || typeof value !== 'object') return false;
  const v = value as { x?: unknown; y?: unknown; z?: unknown };
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/**
 * Read position + rotation for a publish tick, or null when the entity is gone /
 * attributes are missing (safe early-return for teardown races).
 */
export function readPublishPose(el: PoseElement): PublishPose | null {
  // isConnected is false once the node is removed from the document; skip before attribute
  // reads that can throw or return null during destroy.
  if (el.isConnected === false) return null;

  const position = el.getAttribute('position');
  const rotation = el.getAttribute('rotation');
  if (!isVec3(position) || !isVec3(rotation)) return null;

  return {
    x: position.x,
    y: position.y,
    z: position.z,
    xrot: rotation.x,
    yrot: rotation.y,
    zrot: rotation.z
  };
}
