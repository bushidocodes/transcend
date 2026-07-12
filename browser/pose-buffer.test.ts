// Unit tests for the snapshot-interpolation buffer (issue #125). Pure math — runs in node.
// describe/it/expect/beforeEach are Vitest globals.

import type { Pose } from '../shared/protocol.ts';

let pb: typeof import('./pose-buffer.ts');

const pose = (overrides?: Partial<Pose>): Pose => Object.assign({ x: 0, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0 }, overrides);

beforeEach(async () => {
  vi.resetModules(); // the buffer map is module state
  pb = await import('./pose-buffer.ts');
});

describe('pose buffer (issue #125)', () => {
  it('returns null for a user with no snapshots', () => {
    expect(pb.samplePose('nobody', 1000)).toBeNull();
  });

  it('holds the first snapshot before the stream begins (fresh joiner at spawn)', () => {
    pb.pushPose('a', pose({ x: 7 }), 1000);
    // Render time (now - delay) is before the only snapshot.
    const sampled = pb.samplePose('a', 1000)!;
    expect(sampled.x).toBe(7);
  });

  it('lerps position linearly between the bracketing snapshots', () => {
    pb.pushPose('a', pose({ x: 0, z: 10 }), 1000);
    pb.pushPose('a', pose({ x: 4, z: 30 }), 1100);
    // Render time exactly midway: now - INTERP_DELAY_MS = 1050.
    const sampled = pb.samplePose('a', 1050 + pb.INTERP_DELAY_MS)!;
    expect(sampled.x).toBeCloseTo(2);
    expect(sampled.z).toBeCloseTo(20);
    expect(sampled.y).toBeCloseTo(1.3);
  });

  it('holds the last snapshot instead of extrapolating (stopped peer freezes)', () => {
    pb.pushPose('a', pose({ x: 0 }), 1000);
    pb.pushPose('a', pose({ x: 10 }), 1100); // moving fast, then silence
    const sampled = pb.samplePose('a', 999999)!;
    expect(sampled.x).toBe(10); // NOT extrapolated past the last known pose
  });

  it('interpolates rotation along the shortest arc across the 360° seam', () => {
    pb.pushPose('a', pose({ yrot: 350 }), 1000);
    pb.pushPose('a', pose({ yrot: 10 }), 1100);
    const sampled = pb.samplePose('a', 1050 + pb.INTERP_DELAY_MS)!;
    // Midway from 350° to 10° the short way round is 0° (mod 360), not 180°.
    expect(((sampled.yrot % 360) + 360) % 360).toBeCloseTo(0);
  });

  it('caps the buffer, dropping the oldest snapshots', () => {
    for (let i = 0; i < 10; i++) pb.pushPose('a', pose({ x: i }), 1000 + i * 50);
    // A render time far in the past clamps to the oldest RETAINED snapshot.
    const sampled = pb.samplePose('a', 0)!;
    expect(sampled.x).toBeGreaterThan(0); // the x=0..4 snapshots were evicted
  });

  it('non-finite fields inherit the previous snapshot value', () => {
    pb.pushPose('a', pose({ x: 5, yrot: 90 }), 1000);
    pb.pushPose('a', { x: 'garbage', y: 1.3, z: 0, xrot: 0, yrot: NaN, zrot: 0 }, 1100);
    const sampled = pb.samplePose('a', 999999)!;
    expect(sampled.x).toBe(5);
    expect(sampled.yrot).toBe(90);
  });

  it('dropPose forgets the user', () => {
    pb.pushPose('a', pose(), 1000);
    pb.dropPose('a');
    expect(pb.samplePose('a', 2000)).toBeNull();
  });
});
