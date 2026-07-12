// Pure reducer tests for the config slice (issue #175).

import configReducer, { setTickRate } from './config-reducer.ts';

describe('configReducer', () => {
  it('starts with tickRate null', () => {
    expect(configReducer(undefined, { type: '@@INIT' })).toEqual({ tickRate: null });
  });

  it('setTickRate stores the server-provided rate', () => {
    expect(configReducer({ tickRate: null }, setTickRate(5))).toEqual({ tickRate: 5 });
  });

  it('setTickRate overwrites a previous rate', () => {
    expect(configReducer({ tickRate: 5 }, setTickRate(10))).toEqual({ tickRate: 10 });
  });

  it('setTickRate action creator shapes the action correctly', () => {
    expect(setTickRate(3)).toEqual({ type: 'SET_TICK_RATE', tickRate: 3 });
  });

  it('ignores unrelated actions', () => {
    const prior = { tickRate: 2 };
    expect(configReducer(prior, { type: 'SOMETHING_ELSE' })).toBe(prior);
  });
});
