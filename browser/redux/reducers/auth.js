import { Map } from 'immutable';

/* --------------- HELPERS --------------- */

const jsonHeaders = { 'Content-Type': 'application/json' };

const handleJson = response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

/* --------------- INITIAL STATE --------------- */

const initialState = Map({});

/* --------------- ACTIONS --------------- */

const AUTHENTICATED = 'AUTHENTICATED';

/* --------------- ACTION CREATORS --------------- */

export const authenticated = user => ({
  type: AUTHENTICATED, user
});

export const login = (username, password) => {
  return dispatch =>
    fetch('/api/auth/local/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ username, password }),
    })
      .then(handleJson)
      .then(data => {
        const user = Map(data);
        dispatch(authenticated(user));
      })
      .catch(() => {
        dispatch(authenticated(Map({})));
      });
};

export const signup = (name, displayName, email, password) => {
  return dispatch =>
    fetch('/api/auth/local/signup', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ name, displayName, email, password }),
    })
      .then(response => {
        // The server replies 201 with a plain-text "Created" body (no JSON), so don't
        // parse it — just confirm success before logging in.
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return dispatch(login(email, password));
      })
      .catch(err => console.log(err.message));
};

export const logout = () =>
  dispatch =>
    fetch('/api/auth/logout', { method: 'POST' })
      .then(() => dispatch(whoami()))
      .catch(() => dispatch(whoami()));

export const whoami = () => {
  return dispatch =>
    fetch('/api/auth/whoami')
      .then(handleJson)
      .then(data => {
        const user = Map(data);
        dispatch(authenticated(user));
      })
      .catch(failed => dispatch(authenticated(Map({}))));
};

/* --------------- REDUCER --------------- */

export default function authReducer (state = initialState, action) {
  switch (action.type) {
    case AUTHENTICATED:
      return action.user;
  }
  return state;
}
