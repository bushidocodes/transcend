import type { UnknownAction } from 'redux';
import type { AppDispatch, AppThunk } from '../store.ts';

/* --------------- STATE --------------- */

// The logged-in user's record as /whoami returns it, or {} when unauthenticated. The index
// signature reflects that the server sends the whole (password-stripped) DB row.
export interface AuthState {
  id?: number;
  name?: string | null;
  displayName?: string | null;
  skin?: string | null;
  email?: string;
  googleId?: string | null;
  [key: string]: unknown;
}

/* --------------- HELPERS --------------- */

const jsonHeaders = { 'Content-Type': 'application/json' };

const handleJson = (response: Response): Promise<unknown> => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

// Normalize server payloads to a plain object. whoami may return non-object bodies when
// unauthenticated; never store null/array in the auth slice (issue #145).
const asUser = (data: unknown): AuthState =>
  (data && typeof data === 'object' && !Array.isArray(data) ? data as AuthState : {});

/* --------------- INITIAL STATE --------------- */

const initialState: AuthState = {};

/* --------------- ACTIONS --------------- */

const AUTHENTICATED = 'AUTHENTICATED';

interface AuthenticatedAction {
  type: typeof AUTHENTICATED;
  user: AuthState;
}

/* --------------- ACTION CREATORS --------------- */

export const authenticated = (user: AuthState): AuthenticatedAction => ({
  type: AUTHENTICATED, user
});

export const login = (username: string, password: string): AppThunk<Promise<void>> => {
  return (dispatch: AppDispatch) =>
    fetch('/api/auth/local/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ username, password })
    })
      .then(handleJson)
      .then(data => {
        dispatch(authenticated(asUser(data)));
      })
      .catch(() => {
        dispatch(authenticated({}));
      });
};

export const signup = (name: string, displayName: string, email: string, password: string): AppThunk<Promise<void>> => {
  return (dispatch: AppDispatch) =>
    fetch('/api/auth/local/signup', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name, displayName, email, password })
    })
      .then(response => {
        // The server replies 201 with a plain-text "Created" body (no JSON), so don't
        // parse it — just confirm success before logging in.
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return dispatch(login(email, password));
      })
      .catch(err => console.log(err.message));
};

// Returns (not just fires) the chained whoami so callers await the auth slice actually
// clearing — the Logout route navigates on this promise, and RequireAuth would otherwise
// still see the stale auth.id.
export const logout = (): AppThunk<Promise<void>> =>
  (dispatch: AppDispatch) =>
    fetch('/api/auth/logout', { method: 'POST' })
      .then(() => dispatch(whoami()))
      .catch(() => dispatch(whoami()));

export const whoami = (): AppThunk<Promise<void>> => {
  return (dispatch: AppDispatch) =>
    fetch('/api/auth/whoami')
      .then(handleJson)
      .then(data => {
        dispatch(authenticated(asUser(data)));
      })
      .catch(() => { dispatch(authenticated({})); });
};

/* --------------- REDUCER --------------- */

export default function authReducer (state: AuthState = initialState, action: UnknownAction): AuthState {
  switch (action.type) {
    case AUTHENTICATED:
      return (action as unknown as AuthenticatedAction).user;
  }
  return state;
}
