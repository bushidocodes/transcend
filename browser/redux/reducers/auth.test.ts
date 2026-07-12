// Pure reducer / action-creator tests for the auth slice (issue #175).
// Login/signup boolean success contract (issue #228).

import type { UnknownAction } from 'redux';
import { createStore, applyMiddleware } from 'redux';
import type { AppDispatch } from '../store.ts';
import { thunk as thunkMiddleware } from 'redux-thunk';
import authReducer, { authenticated, login, signup, type AuthState } from './auth.ts';

// Action creators return narrow interfaces that lack Redux's UnknownAction index signature;
// cast at the call site so tsc matches the reducer's real parameter type.
const asAction = (a: object): UnknownAction => a as UnknownAction;

describe('authReducer', () => {
  it('returns empty object as the initial state', () => {
    expect(authReducer(undefined, { type: '@@INIT' })).toEqual({});
  });

  it('authenticated replaces state with the user payload', () => {
    const user: AuthState = { id: 7, email: 'alice@example.com', displayName: 'Alice' };
    expect(authReducer({}, asAction(authenticated(user)))).toEqual(user);
  });

  it('authenticated can clear auth with an empty object (logout path)', () => {
    const prior: AuthState = { id: 1, email: 'bob@example.com' };
    expect(authReducer(prior, asAction(authenticated({})))).toEqual({});
  });

  it('authenticated action creator shapes the action correctly', () => {
    const user: AuthState = { id: 3, name: 'Carol' };
    expect(authenticated(user)).toEqual({ type: 'AUTHENTICATED', user });
  });

  it('ignores unrelated actions', () => {
    const prior: AuthState = { id: 2 };
    expect(authReducer(prior, { type: 'SOMETHING_ELSE' })).toBe(prior);
  });
});

// Issue #228: failed login/signup must resolve false (not silently resolve void) so Home
// can skip navigate('/vr') and show an error.
describe('login / signup success boolean (issue #228)', () => {
  function makeStore() {
    return createStore(authReducer, applyMiddleware(thunkMiddleware));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('login resolves true and stores the user on HTTP success', async () => {
    const user = { id: 9, email: 'ok@example.com' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(user)
      })
    );
    const store = makeStore();
    const ok = await (store.dispatch as AppDispatch)(login('ok@example.com', 'secret'));
    expect(ok).toBe(true);
    expect(store.getState()).toEqual(user);
  });

  it('login resolves false and clears auth on HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({})
      })
    );
    const store = makeStore();
    store.dispatch(asAction(authenticated({ id: 1, email: 'stale@example.com' })));
    const ok = await (store.dispatch as AppDispatch)(login('bad@example.com', 'nope'));
    expect(ok).toBe(false);
    expect(store.getState()).toEqual({});
  });

  it('signup resolves false when the signup response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400
      })
    );
    const store = makeStore();
    const ok = await (store.dispatch as AppDispatch)(
      signup('Ada', 'Ada', 'ada@example.com', 'secret')
    );
    expect(ok).toBe(false);
  });
});
