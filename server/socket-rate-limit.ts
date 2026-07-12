/**
 * Per-socket sliding-window rate limiter for chatty socket events (issue #203).
 *
 * A single authenticated socket can flood TICK / CHANGE_SCENE / RELAY_* and drive
 * dirty-scene broadcasts for every peer. Limits are intentionally generous for a
 * classroom (shared-NAT, many students) while still dropping unbounded sprays.
 *
 * Pure class — no socket.io dependency — so unit tests can drive it with fake ids
 * and a controlled clock without spinning up a real server.
 */

export class SocketRateLimiter {
  private hits = new Map<string, number[]>();
  private maxPerWindow: number;
  private windowMs: number;
  private now: () => number;

  /**
   * @param maxPerWindow  Max events allowed per key inside one window
   * @param windowMs      Sliding window length in milliseconds
   * @param now           Optional clock (injectable for tests); defaults to Date.now
   */
  // Explicit field assignment (not parameter properties): tsconfig erasableSyntaxOnly
  // forbids constructor param properties that emit runtime JS.
  constructor(maxPerWindow: number, windowMs: number, now: () => number = Date.now) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
    this.now = now;
  }

  /**
   * Record a hit for `key` and return whether it is still under the limit.
   * Timestamps older than the window are pruned so memory stays bounded.
   */
  allow(key: string): boolean {
    const t = this.now();
    const cutoff = t - this.windowMs;
    let stamps = this.hits.get(key);
    if (!stamps) {
      stamps = [];
      this.hits.set(key, stamps);
    } else {
      // Drop expired timestamps in place (cheap for the small N we keep).
      let write = 0;
      for (let i = 0; i < stamps.length; i++) {
        if (stamps[i] > cutoff) stamps[write++] = stamps[i];
      }
      stamps.length = write;
    }
    if (stamps.length >= this.maxPerWindow) return false;
    stamps.push(t);
    return true;
  }

  /** Forget a key (call on disconnect so the map does not grow forever). */
  forget(key: string): void {
    this.hits.delete(key);
  }

  /** Number of keys currently tracked (test helper). */
  get size(): number {
    return this.hits.size;
  }
}

/** Default limits for the chatty multiplayer events (issue #203). */
export const SOCKET_RATE_LIMITS = {
  // Pose ticks: clients emit every Nth frame; ~20/s is plenty, 30/s leaves headroom.
  tick: { maxPerWindow: 30, windowMs: 1000 },
  // Scene / skin changes are user-driven; a few per second is more than enough.
  changeScene: { maxPerWindow: 10, windowMs: 1000 },
  changeSkin: { maxPerWindow: 10, windowMs: 1000 },
  // Join is once per session in the happy path; still cap re-join spam.
  joinScene: { maxPerWindow: 5, windowMs: 1000 },
  // WebRTC signaling can burst during ICE gather; keep it generous.
  relay: { maxPerWindow: 40, windowMs: 1000 }
} as const;
