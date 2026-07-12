// currentRoom is THE path→room derivation (issue #119) — the wire scene name and WebRTC
// chat-room key are both derived from it, so these cases pin the deployed room names.
// describe/it/expect are Vitest globals.

import { currentRoom } from './navigate.ts';

describe('currentRoom (issue #119)', () => {
  it('derives the wire room name from a room path', () => {
    expect(currentRoom('/vr/lobby')).toBe('vrlobby');
    expect(currentRoom('/vr/thebasement')).toBe('vrthebasement');
    expect(currentRoom('/vr/spaceroom')).toBe('vrspaceroom');
    expect(currentRoom('/vr/thegap')).toBe('vrthegap');
  });

  it('tolerates a trailing slash', () => {
    expect(currentRoom('/vr/lobby/')).toBe('vrlobby');
  });

  it('returns null when no actual room is selected', () => {
    expect(currentRoom('/vr')).toBeNull(); // index route, mid-redirect
    expect(currentRoom('/vr/')).toBeNull();
    expect(currentRoom('/')).toBeNull();
    expect(currentRoom('/login')).toBeNull();
  });
});
