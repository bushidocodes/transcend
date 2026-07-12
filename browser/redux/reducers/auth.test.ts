// Pure reducer / action-creator tests for the auth slice (issue #175).

import authReducer, { authenticated, type AuthState } from './auth.ts';

describe('authReducer', () => {
  it('returns empty object as the initial state', () => {
    expect(authReducer(undefined, { type: '@@INIT' })).toEqual({});
  });

  it('authenticated replaces state with the user payload', () => {
    const user: AuthState = { id: 7, email: 'alice@example.com', displayName: 'Alice' };
    expect(authReducer({}, authenticated(user))).toEqual(user);
  });

  it('authenticated can clear auth with an empty object (logout path)', () => {
    const prior: AuthState = { id: 1, email: 'bob@example.com' };
    expect(authReducer(prior, authenticated({}))).toEqual({});
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
