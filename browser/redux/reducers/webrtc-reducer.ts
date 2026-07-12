import type { UnknownAction } from 'redux';

// WebRTC connections and media elements for this client. Plain objects (issue #145) —
// peers is a dictionary of peerId → RTCPeerConnection; peerMediaElements is reserved for
// any future store-backed audio tags (DOM tags currently live in webRTC/client.ts).
export interface WebrtcState {
  localMediaStream: MediaStream | null;
  peers: Record<string, RTCPeerConnection>;
  peerMediaElements: Record<string, HTMLMediaElement>;
}

const initialState: WebrtcState = {
  localMediaStream: null,
  peers: {},
  peerMediaElements: {}
};

/* --------------- ACTIONS --------------- */

const SET_USER_MEDIA = 'SET_USER_MEDIA';
const ADD_PEER = 'ADD_PEER';
const DELETE_PEER = 'DELETE_PEER';
const CLEAR_PEERS = 'CLEAR_PEERS';

interface SetUserMediaAction {
  type: typeof SET_USER_MEDIA;
  stream: MediaStream;
}

interface AddPeerAction {
  type: typeof ADD_PEER;
  peerId: string;
  peerConnection: RTCPeerConnection;
}

interface DeletePeerAction {
  type: typeof DELETE_PEER;
  peerId: string;
}

/* --------------- ACTION CREATORS --------------- */

export const setUserMedia = (stream: MediaStream): SetUserMediaAction => {
  return {
    type: SET_USER_MEDIA,
    stream
  };
};

export const addPeer = (peerId: string, peerConnection: RTCPeerConnection): AddPeerAction => {
  return {
    type: ADD_PEER,
    peerId,
    peerConnection
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
      return { ...state, localMediaStream: (action as unknown as SetUserMediaAction).stream };

    case ADD_PEER: {
      const { peerId, peerConnection } = action as unknown as AddPeerAction;
      return {
        ...state,
        peers: { ...state.peers, [peerId]: peerConnection }
      };
    }

    case DELETE_PEER: {
      const peers = { ...state.peers };
      delete peers[(action as unknown as DeletePeerAction).peerId];
      return { ...state, peers };
    }

    case CLEAR_PEERS:
      // Keep localMediaStream; only drop peer connections / media-element maps.
      return { ...state, peers: {}, peerMediaElements: {} };

    default:
      return state;
  }
}
