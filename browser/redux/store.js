import { createStore, applyMiddleware, combineReducers } from 'redux';

import { thunk as thunkMiddleware } from 'redux-thunk';

import userReducer from './reducers/user-reducer';
import authReducer from './reducers/auth';
import isLoadedReducer from './reducers/is-loaded-reducer';
import webrtcReducer from './reducers/webrtc-reducer';
import configReducer from './reducers/config-reducer';

const rootReducer = combineReducers({
  users: userReducer,
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
