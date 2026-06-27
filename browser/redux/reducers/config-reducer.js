/* --------------- ACTIONS --------------- */

export const SET_TICK_RATE = 'SET_TICK_RATE';

/* --------------- ACTION CREATORS --------------- */

// tickRate: publish-location emits a position on every Nth animation frame. The server hands
// this value to the client in the sceneState handshake (issue #69), so the update rate is
// server-controlled rather than fixed at one emit per frame.
export const setTickRate = tickRate => {
  return {
    type: SET_TICK_RATE,
    tickRate
  };
};

/* --------------- REDUCER --------------- */

const initialState = { tickRate: null };

export default function configReducer (state = initialState, action) {
  switch (action.type) {
    case SET_TICK_RATE:
      return { ...state, tickRate: action.tickRate };

    default:
      return state;
  }
}
