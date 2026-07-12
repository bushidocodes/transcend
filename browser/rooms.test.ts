// Pins the room manifest (issue #119). The router derives its /vr routes from ROOMS and
// asserts its component map against it at startup; these checks keep the data itself sane.
// describe/it/expect are Vitest globals.

import { ROOMS, DEFAULT_ROOM, roomLabel } from './rooms.ts';

describe('room manifest (issue #119)', () => {
  it('paths are unique, non-empty, and slash-free (they are single route segments)', () => {
    const paths = ROOMS.map(room => room.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(path).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('every room has a display label', () => {
    for (const { label } of ROOMS) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('the default room is in the manifest', () => {
    expect(ROOMS.some(room => room.path === DEFAULT_ROOM)).toBe(true);
  });

  it('roomLabel resolves known paths and falls back to the path for unknown ones', () => {
    expect(roomLabel('thebasement')).toBe('The Basement');
    expect(roomLabel('not-a-room')).toBe('not-a-room');
  });
});
