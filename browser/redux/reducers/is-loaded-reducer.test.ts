// Pure reducer tests for the is-loaded boolean slice (issue #175).

import isLoadedReducer, { setAsLoaded } from './is-loaded-reducer.ts';

describe('isLoadedReducer', () => {
  it('starts as false', () => {
    expect(isLoadedReducer(undefined, { type: '@@INIT' })).toBe(false);
  });

  it('setAsLoaded flips the flag to true', () => {
    expect(isLoadedReducer(false, setAsLoaded())).toBe(true);
  });

  it('stays true once loaded', () => {
    expect(isLoadedReducer(true, setAsLoaded())).toBe(true);
  });

  it('setAsLoaded action creator shapes the action correctly', () => {
    expect(setAsLoaded()).toEqual({ type: 'SET_AS_LOADED' });
  });

  it('ignores unrelated actions', () => {
    expect(isLoadedReducer(false, { type: 'SOMETHING_ELSE' })).toBe(false);
    expect(isLoadedReducer(true, { type: 'SOMETHING_ELSE' })).toBe(true);
  });
});
