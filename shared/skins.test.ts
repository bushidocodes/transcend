// Pins the shared skin catalog (issue #119). The ids are security-relevant: the server
// whitelist derives from this list, and each id is interpolated into a
// `skinUrl: ../../images/${id}.png` component string rendered on every client (#79).
// describe/it/expect are Vitest globals.

import { SKINS } from './skins.ts';
import VALID_SKINS from '../server/validSkins.ts';

describe('shared skin catalog (issue #119)', () => {
  it('ids are unique', () => {
    const ids = SKINS.map(skin => skin.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every id is a safe filename fragment (no separators, dots, or spaces)', () => {
    for (const { id } of SKINS) {
      expect(id).toMatch(/^[A-Za-z0-9-]+$/);
    }
  });

  it('every entry has a non-empty label', () => {
    for (const { label } of SKINS) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('the server whitelist is exactly this catalog (no drift in either direction)', () => {
    expect(VALID_SKINS.size).toBe(SKINS.length);
    for (const { id } of SKINS) {
      expect(VALID_SKINS.has(id)).toBe(true);
    }
  });
});
