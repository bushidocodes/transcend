const { Map } = require('immutable');

const { User } = require('../../utils');

/* --------------- INITIAL STATE --------------- */

const initialState = Map({});

/* --------------- ACTIONS --------------- */

const ADD_USER = 'ADD_USER';
const UPDATE_USER_DATA = 'UPDATE_USER_DATA';
const REMOVE_USER = 'REMOVE_USER';

/* --------------- ACTION CREATORS --------------- */

const addUser = user => {
  return {
    type: ADD_USER,
    user
  };
};

const updateUserData = userData => {
  return {
    type: UPDATE_USER_DATA,
    userData
  };
};

const removeUser = userId => {
  return {
    type: REMOVE_USER,
    userId
  };
};

/* --------------- THUNK ACTION CREATORS --------------- */

// Create and persist a user for the socket, in the given scene/room. No emit: the caller
// (joinScene) follows up with a single sceneState message (issue #69).
const createUser = (socket, user, scene) => {
  return dispatch => {
    const newUser = Map(new User(socket.id, user.displayName, user.skin));
    dispatch(addUser(scene ? newUser.set('scene', scene) : newUser));
    console.log('User created');
  };
};

const removeUserAndEmit = socket => {
  return (dispatch, getState) => {
    const userId = socket.id;
    // Capture the leaving user's room before we drop them from the store.
    const leaving = getState().users.get(userId);
    const scene = leaving ? leaving.get('scene') : undefined;
    dispatch(removeUser(userId));
    // Only clients in the same room ever rendered this avatar, so only they need the
    // removeUser (#57). Sockets in other rooms (or not yet placed) never saw it.
    getState().sockets.forEach(peerSocket => {
      if (peerSocket.id === userId) return;
      const peer = getState().users.get(peerSocket.id);
      if (peer && peer.get('scene') === scene) {
        peerSocket.emit('removeUser', userId);
      }
    });
  };
};

/* --------------- REDUCER --------------- */

function userReducer (state = initialState, action) {
  switch (action.type) {
    case ADD_USER:
      return state.set(action.user.get('id'), action.user);

    case UPDATE_USER_DATA:
      // A position tick must only ever UPDATE an already-registered user; it must
      // never CREATE one. immutable's mergeIn auto-vivifies a missing path, so an
      // unguarded merge turns a tick (which carries no displayName) into a brand-new
      // user record. After a server restart, reconnecting clients keep ticking under
      // their old socket id before re-registering, and those ghost records render with
      // the default "John" nickname (issue #56). User creation is joinScene's job
      // alone (ADD_USER), so drop ticks for ids we don't already know about.
      if (!state.has(action.userData.get('id'))) return state;
      return state.mergeIn([action.userData.get('id')], action.userData);

    case REMOVE_USER:
      return state.delete(action.userId);

    default:
      return state;
  }
}

module.exports = {
  ADD_USER,
  UPDATE_USER_DATA,
  REMOVE_USER,
  createUser,
  updateUserData,
  removeUserAndEmit,
  userReducer
};
