import type { UnknownAction } from 'redux';

/* --------------- STATE --------------- */

export interface ConfigState {
  // null until the sceneState handshake delivers the server's rate.
  tickRate: number | null;
}

/* --------------- ACTIONS --------------- */

export const SET_TICK_RATE = 'SET_TICK_RATE';

interface SetTickRateAction {
  type: typeof SET_TICK_RATE;
  tickRate: number;
}

/* --------------- ACTION CREATORS --------------- */

// tickRate: publish-location emits a position on every Nth animation frame. The server hands
// this value to the client in the sceneState handshake (issue #69), so the update rate is
// server-controlled rather than fixed at one emit per frame.
export const setTickRate = (tickRate: number): SetTickRateAction => {
  return {
    type: SET_TICK_RATE,
    tickRate
  };
};

/* --------------- REDUCER --------------- */

const initialState: ConfigState = { tickRate: null };

export default function configReducer (state: ConfigState = initialState, action: UnknownAction): ConfigState {
  switch (action.type) {
    case SET_TICK_RATE:
      return { ...state, tickRate: (action as unknown as SetTickRateAction).tickRate };

    default:
      return state;
  }
}
