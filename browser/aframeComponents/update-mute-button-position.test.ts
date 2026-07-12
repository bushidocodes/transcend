/**
 * Regression for issue #202: publish-location tick must not throw when #mutebutton is
 * gone during logout teardown.
 */

import { updateMuteButtonPosition } from './update-mute-button-position.ts';

describe('updateMuteButtonPosition (issue #202)', () => {
  it('is a no-op when #mutebutton is missing', () => {
    const doc = {
      getElementById: () => null
    };
    expect(() => {
      updateMuteButtonPosition({ x: 1, z: 2 }, doc);
    }).not.toThrow();
  });

  it('sets position under the local avatar when the button exists', () => {
    const el = {
      setAttribute: vi.fn()
    };
    const doc = {
      getElementById: (id: string) => (id === 'mutebutton' ? el : null)
    };
    updateMuteButtonPosition({ x: 3.5, z: -2 }, doc as any);
    expect(el.setAttribute).toHaveBeenCalledWith('position', '3.5 0.1 -3');
  });
});
