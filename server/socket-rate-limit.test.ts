/**
 * Unit tests for SocketRateLimiter (issue #203).
 *
 * Uses an injectable clock so we can slide the window without real sleeps.
 */

import { SocketRateLimiter } from './socket-rate-limit.ts';

describe('SocketRateLimiter (issue #203)', () => {
  it('allows up to maxPerWindow hits inside the window', () => {
    let t = 1000;
    const lim = new SocketRateLimiter(3, 1000, () => t);

    expect(lim.allow('a')).toBe(true);
    expect(lim.allow('a')).toBe(true);
    expect(lim.allow('a')).toBe(true);
    expect(lim.allow('a')).toBe(false);
  });

  it('tracks keys independently', () => {
    let t = 1000;
    const lim = new SocketRateLimiter(1, 1000, () => t);

    expect(lim.allow('a')).toBe(true);
    expect(lim.allow('a')).toBe(false);
    expect(lim.allow('b')).toBe(true);
    expect(lim.allow('b')).toBe(false);
  });

  it('slides the window: old hits fall off and free capacity', () => {
    let t = 0;
    const lim = new SocketRateLimiter(2, 100, () => t);

    expect(lim.allow('a')).toBe(true); // t=0
    t = 50;
    expect(lim.allow('a')).toBe(true); // t=50
    expect(lim.allow('a')).toBe(false);

    // Advance past the first hit's window (0 is now older than 100ms).
    t = 101;
    expect(lim.allow('a')).toBe(true); // only t=50 remains; one slot free
    expect(lim.allow('a')).toBe(false); // full again (50, 101)
  });

  it('forget removes a key so a new window starts fresh', () => {
    let t = 0;
    const lim = new SocketRateLimiter(1, 1000, () => t);

    expect(lim.allow('a')).toBe(true);
    expect(lim.allow('a')).toBe(false);
    lim.forget('a');
    expect(lim.size).toBe(0);
    expect(lim.allow('a')).toBe(true);
  });

  it('prunes expired timestamps so memory does not grow unbounded', () => {
    let t = 0;
    const lim = new SocketRateLimiter(5, 100, () => t);

    for (let i = 0; i < 5; i++) {
      expect(lim.allow('a')).toBe(true);
      t += 10;
    }
    // Jump well past the window; next allow should start from an empty list.
    t = 10_000;
    expect(lim.allow('a')).toBe(true);
  });
});
