/**
 * Regression for issue #224: publish-location tick must not throw when position/rotation
 * attributes are missing or the entity is disconnected during teardown.
 */

import { readPublishPose } from './read-publish-pose.ts';

describe('readPublishPose (issue #224)', () => {
  it('returns pose when position and rotation are present', () => {
    const el = {
      isConnected: true,
      getAttribute: (name: string) => {
        if (name === 'position') return { x: 1, y: 2, z: 3 };
        if (name === 'rotation') return { x: 10, y: 20, z: 30 };
        return null;
      }
    };
    expect(readPublishPose(el)).toEqual({
      x: 1,
      y: 2,
      z: 3,
      xrot: 10,
      yrot: 20,
      zrot: 30
    });
  });

  it('returns null when isConnected is false', () => {
    const el = {
      isConnected: false,
      getAttribute: vi.fn(() => ({ x: 1, y: 2, z: 3 }))
    };
    expect(readPublishPose(el)).toBeNull();
    expect(el.getAttribute).not.toHaveBeenCalled();
  });

  it('returns null when position is missing', () => {
    const el = {
      isConnected: true,
      getAttribute: (name: string) => (name === 'rotation' ? { x: 0, y: 0, z: 0 } : null)
    };
    expect(readPublishPose(el)).toBeNull();
  });

  it('returns null when rotation is missing', () => {
    const el = {
      isConnected: true,
      getAttribute: (name: string) => (name === 'position' ? { x: 0, y: 0, z: 0 } : null)
    };
    expect(readPublishPose(el)).toBeNull();
  });

  it('returns null when position components are non-finite', () => {
    const el = {
      isConnected: true,
      getAttribute: (name: string) => {
        if (name === 'position') return { x: NaN, y: 0, z: 0 };
        if (name === 'rotation') return { x: 0, y: 0, z: 0 };
        return null;
      }
    };
    expect(readPublishPose(el)).toBeNull();
  });

  it('does not throw when getAttribute returns undefined', () => {
    const el = {
      getAttribute: () => undefined
    };
    expect(() => readPublishPose(el)).not.toThrow();
    expect(readPublishPose(el)).toBeNull();
  });
});
