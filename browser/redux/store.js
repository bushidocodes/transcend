// Redux 5 still exports createStore but marks it @deprecated (visual only) to push RTK's
// configureStore. We keep the classic store API for now (issue #154) and use the non-deprecated
// alias so tooling stays quiet. Migrating to @reduxjs/toolkit is a separate effort.
import { legacy_createStore as createStore, applyMiddleware, combineReducers } from 'redux';

import { thunk as thunkMiddleware } from 'redux-thunk';

import authReducer from './reducers/auth';
import isLoadedReducer from './reducers/is-loaded-reducer';
import webrtcReducer from './reducers/webrtc-reducer';
import configReducer from './reducers/config-reducer';

// No users reducer: remote users live only in AvatarManager's entity registry (#118). The old
// one was written by the usersUpdated handler and read back by nothing but that same handler.
const rootReducer = combineReducers({
  auth: authReducer,
  isLoaded: isLoadedReducer,
  webrtc: webrtcReducer,
  config: configReducer
});

export default createStore(
  rootReducer,
  applyMiddleware(
    thunkMiddleware
  )
);
