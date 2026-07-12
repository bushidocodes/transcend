// Redux 5 still exports createStore but marks it @deprecated (visual only) to push RTK's
// configureStore. We keep the classic store API for now (issue #154) and use the non-deprecated
// alias so tooling stays quiet. Migrating to @reduxjs/toolkit is a separate effort.
import { legacy_createStore as createStore, applyMiddleware, combineReducers, type Action } from 'redux';

import { thunk as thunkMiddleware, type ThunkAction, type ThunkDispatch } from 'redux-thunk';

import authReducer from './reducers/auth.ts';
import isLoadedReducer from './reducers/is-loaded-reducer.ts';
import webrtcReducer from './reducers/webrtc-reducer.ts';
import configReducer from './reducers/config-reducer.ts';

// No users reducer: remote users live only in AvatarManager's entity registry (#118). The old
// one was written by the usersUpdated handler and read back by nothing but that same handler.
const rootReducer = combineReducers({
  auth: authReducer,
  isLoaded: isLoadedReducer,
  webrtc: webrtcReducer,
  config: configReducer
});

export type RootState = ReturnType<typeof rootReducer>;
// The store's real dispatch: thunk-aware, so dispatch(login(...)) returns the thunk's promise.
// The action generic is redux's base Action (not UnknownAction) so concrete action interfaces
// dispatch without needing index signatures.
export type AppDispatch = ThunkDispatch<RootState, undefined, Action>;
export type AppThunk<R = void> = ThunkAction<R, RootState, undefined, Action>;

const store = createStore(
  rootReducer,
  applyMiddleware(
    thunkMiddleware
  )
);

export default store;
