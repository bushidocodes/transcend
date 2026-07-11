import { createStore, applyMiddleware, combineReducers } from 'redux';

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
