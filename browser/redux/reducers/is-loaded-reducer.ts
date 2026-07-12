import type { UnknownAction } from 'redux';

/* --------------- ACTIONS --------------- */

export const SET_AS_LOADED = 'SET_AS_LOADED';

/* --------------- ACTION CREATORS --------------- */

export const setAsLoaded = (): { type: typeof SET_AS_LOADED } => {
  return {
    type: SET_AS_LOADED
  };
};

/* --------------- REDUCER --------------- */

export default function configReducer (state: boolean = false, action: UnknownAction): boolean {
  switch (action.type) {
    case SET_AS_LOADED:
      return true;

    default:
      return state;
  }
}
