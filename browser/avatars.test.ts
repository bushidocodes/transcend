// @vitest-environment happy-dom

/**
 * Unit tests for AvatarManager (issue #118) — the single owner of avatar entities. Runs the
 * real module against a DOM (happy-dom) with a stub #scene container; a-minecraft renders as
 * an unknown element here, which is fine: the manager only creates elements and sets
 * attributes, and A-Frame's components hydrate them in the real app.
 */

import type { AvatarUser } from './avatars.ts';

let avatars: typeof import('./avatars.ts');
let poseBuffer: typeof import('./pose-buffer.ts');

// The latest pose a remote-pose component would render, once the stream has settled.
const latestPose = (id: string) => poseBuffer.samplePose(id, Number.MAX_SAFE_INTEGER);

const user = (id: string, overrides?: Partial<AvatarUser>): AvatarUser => Object.assign({
  id,
  displayName: id.toUpperCase(),
  skin: 'batman',
  x: 1,
  y: 1.3,
  z: 2,
  xrot: 0,
  yrot: 90,
  zrot: 0
}, overrides);

const head = (id: string) => document.getElementById(id);
const body = (id: string) => document.getElementById(`${id}-body`);

beforeEach(async () => {
  document.body.innerHTML = '<div id="scene"></div>';
  // Fresh modules per test: the manager's registry and the pose buffer are module state.
  vi.resetModules();
  avatars = await import('./avatars.ts');
  poseBuffer = await import('./pose-buffer.ts');
});

describe('AvatarManager – sync', () => {
  it('adds a head and body for each new remote user', () => {
    avatars.sync({ a: user('a'), b: user('b', { skin: 'woody' }) });

    expect(head('a')).not.toBeNull();
    expect(body('a')).not.toBeNull();
    expect(head('a')!.getAttribute('minecraft-nickname')).toBe('A');
    expect(head('a')!.getAttribute('position')).toBe('1 1.3 2');
    expect(head('a')!.getAttribute('rotation')).toBe('0 90 0');
    expect(body('a')!.getAttribute('rotation')).toBe('0 90 0');
    expect(head('b')!.getAttribute('skin')).toBe('woody');
    // Both entities carry the interpolation component (#125), and the buffer is seeded.
    expect(head('a')!.getAttribute('remote-pose')).toContain('userId: a');
    expect(body('a')!.getAttribute('remote-pose')).toContain('part: body');
    expect(latestPose('a')!.yrot).toBe(90);
  });

  it('feeds pose updates into the interpolation buffer without duplicating entities (#125)', () => {
    avatars.sync({ a: user('a') });
    const el = head('a');
    avatars.sync({ a: user('a', { x: 9, z: -4, yrot: 180 }) });

    expect(document.querySelectorAll('a-minecraft').length).toBe(2); // one head + one body
    expect(head('a')).toBe(el); // same entity — rendering happens per-frame via remote-pose
    const pose = latestPose('a')!;
    expect(pose.x).toBe(9);
    expect(pose.z).toBe(-4);
    expect(pose.yrot).toBe(180);
  });

  it('redraws (removes and recreates) an avatar whose skin changed', () => {
    avatars.sync({ a: user('a') });
    const before = head('a');
    avatars.sync({ a: user('a', { skin: 'woody' }) });

    expect(head('a')).not.toBe(before);        // rebuilt, not mutated
    expect(head('a')!.getAttribute('skin')).toBe('woody');
    expect(head('a')!.getAttribute('minecraft')).toContain('woody.png');
    expect(document.querySelectorAll('a-minecraft').length).toBe(2);
  });

  it('removes avatars absent from the payload (they left the room, or we did)', () => {
    avatars.sync({ a: user('a'), b: user('b') });
    avatars.sync({ a: user('a') });

    expect(head('b')).toBeNull();
    expect(body('b')).toBeNull();
    expect(head('a')).not.toBeNull();
  });

  it('an empty payload clears every remote avatar', () => {
    avatars.sync({ a: user('a'), b: user('b') });
    avatars.sync({});
    expect(document.querySelectorAll('a-minecraft').length).toBe(0);
  });

  it('never touches the local avatar, even if the payload names its id', () => {
    const localHead = avatars.setLocal(user('me'));
    avatars.sync({ me: user('me', { x: 999 }), a: user('a') });

    expect(head('me')).toBe(localHead);                       // same entity, untouched
    expect(head('me')!.getAttribute('position')).toBe('1 1.3 2'); // not teleported to 999
    expect(body('me')).toBeNull();                            // no body was created for it
    avatars.sync({});
    expect(head('me')).toBe(localHead);                       // sync removals skip local too
  });

  it('falls back to the default skin for a user without one', () => {
    avatars.sync({ a: user('a', { skin: undefined }) });
    expect(head('a')!.getAttribute('skin')).toBe('3djesus');
    // ...and a skinless user on a later beat is a pose update, not an endless redraw.
    const el = head('a');
    avatars.sync({ a: user('a', { skin: undefined, x: 5 }) });
    expect(head('a')).toBe(el);
    expect(latestPose('a')!.x).toBe(5);
  });

  it('does not set minecraft-nickname to "undefined" when displayName is missing (#173)', () => {
    avatars.sync({ a: user('a', { displayName: undefined }) });
    // Attribute absent (or empty) — never the string "undefined".
    expect(head('a')!.getAttribute('minecraft-nickname')).not.toBe('undefined');
    expect(head('a')!.hasAttribute('minecraft-nickname')).toBe(false);

    // Empty string is also falsy and must not become a blank/undefined tag.
    avatars.sync({ b: user('b', { displayName: '' }) });
    expect(head('b')!.hasAttribute('minecraft-nickname')).toBe(false);
  });
});

describe('AvatarManager – remove', () => {
  it('removes head and body for the given id and is a safe no-op for unknown ids', () => {
    avatars.sync({ a: user('a') });
    avatars.remove('a');
    expect(head('a')).toBeNull();
    expect(body('a')).toBeNull();
    expect(latestPose('a')).toBeNull(); // the interpolation buffer is dropped too (#125)
    expect(() => avatars.remove('nobody')).not.toThrow();
  });
});

describe('AvatarManager – local avatar', () => {
  it('setLocal renders a head only and returns the entity', () => {
    const el = avatars.setLocal(user('me'));
    expect(el).toBe(head('me'));
    expect(body('me')).toBeNull();
  });

  it('setLocal is idempotent: a re-join replaces the old local avatar (reconnect, #56)', () => {
    avatars.setLocal(user('old-id'));
    avatars.setLocal(user('new-id'));
    expect(head('old-id')).toBeNull();
    expect(head('new-id')).not.toBeNull();
    expect(document.querySelectorAll('a-minecraft').length).toBe(1);
  });

  it('removeLocal tears down the head and the #mutebutton rig entity', () => {
    avatars.setLocal(user('me'));
    const mute = document.createElement('a-entity');
    mute.setAttribute('id', 'mutebutton');
    document.getElementById('scene')!.appendChild(mute);

    avatars.removeLocal();
    expect(head('me')).toBeNull();
    expect(document.getElementById('mutebutton')).toBeNull();
    expect(() => avatars.removeLocal()).not.toThrow(); // safe when nothing to remove
  });

  it('removeLocal falls back to the publish-location marker when setLocal never ran', () => {
    const stray = document.createElement('a-minecraft');
    stray.setAttribute('publish-location', '');
    document.getElementById('scene')!.appendChild(stray);

    avatars.removeLocal();
    expect(document.querySelector('a-minecraft[publish-location]')).toBeNull();
  });

  it('setLocalSkin restyles the local head and is a no-op without one', () => {
    expect(() => avatars.setLocalSkin('woody')).not.toThrow();
    avatars.setLocal(user('me'));
    avatars.setLocalSkin('woody');
    expect(head('me')!.getAttribute('skin')).toBe('woody');
    expect(head('me')!.getAttribute('minecraft')).toContain('woody.png');
  });
});
