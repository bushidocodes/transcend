import type { UnknownAction } from 'redux';

// Serializable WebRTC descriptors only (issue #176). MediaStream and RTCPeerConnection live
// in module-level registries in browser/webRTC/client.ts — Redux must stay JSON-safe for
// time-travel / logging / DevTools, and peerMediaElements was always dead (the real map is
// the module-level peerMediaElements in client.ts).
export interface WebrtcState {
  peerIds: string[];
  hasLocalMedia: boolean;
}

const initialState: WebrtcState = {
  peerIds: [],
  hasLocalMedia: false
};

/* --------------- ACTIONS --------------- */

const SET_USER_MEDIA = 'SET_USER_MEDIA';
const CLEAR_USER_MEDIA = 'CLEAR_USER_MEDIA';
const ADD_PEER = 'ADD_PEER';
const DELETE_PEER = 'DELETE_PEER';
const CLEAR_PEERS = 'CLEAR_PEERS';

interface SetUserMediaAction {
  type: typeof SET_USER_MEDIA;
}

interface ClearUserMediaAction {
  type: typeof CLEAR_USER_MEDIA;
}

interface AddPeerAction {
  type: typeof ADD_PEER;
  peerId: string;
}

interface DeletePeerAction {
  type: typeof DELETE_PEER;
  peerId: string;
}

/* --------------- ACTION CREATORS --------------- */

// Caller registers the MediaStream in client.ts first, then dispatches this flag-only action.
export const setUserMedia = (): SetUserMediaAction => {
  return {
    type: SET_USER_MEDIA
  };
};

export const clearUserMedia = (): ClearUserMediaAction => {
  return {
    type: CLEAR_USER_MEDIA
  };
};

// Caller registers the RTCPeerConnection in client.ts first; only the id is stored here.
export const addPeer = (peerId: string): AddPeerAction => {
  return {
    type: ADD_PEER,
    peerId
  };
};

export const deletePeer = (peerId: string): DeletePeerAction => {
  return {
    type: DELETE_PEER,
    peerId
  };
};

export const clearPeers = (): { type: typeof CLEAR_PEERS } => {
  return {
    type: CLEAR_PEERS
  };
};

/* --------------- REDUCER --------------- */

export default function webrtcReducer (state: WebrtcState = initialState, action: UnknownAction): WebrtcState {
  switch (action.type) {
    case SET_USER_MEDIA:
      return { ...state, hasLocalMedia: true };

    case CLEAR_USER_MEDIA:
      return { ...state, hasLocalMedia: false };

    case ADD_PEER: {
      const { peerId } = action as unknown as AddPeerAction;
      if (state.peerIds.includes(peerId)) return state;
      return {
        ...state,
        peerIds: [...state.peerIds, peerId]
      };
    }

    case DELETE_PEER: {
      const peerId = (action as unknown as DeletePeerAction).peerId;
      return {
        ...state,
        peerIds: state.peerIds.filter(id => id !== peerId)
      };
    }

    case CLEAR_PEERS:
      // Keep hasLocalMedia; only drop peer id list (mic stream is reused across room changes).
      return { ...state, peerIds: [] };

    default:
      return state;
  }
}
