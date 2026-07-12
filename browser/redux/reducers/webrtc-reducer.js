// WebRTC connections and media elements for this client. Plain objects (issue #145) —
// peers is a dictionary of peerId → RTCPeerConnection; peerMediaElements is reserved for
// any future store-backed audio tags (DOM tags currently live in webRTC/client.js).
const initialState = {
  localMediaStream: null,
  peers: {},
  peerMediaElements: {}
};
/* --------------- ACTIONS --------------- */

const SET_USER_MEDIA = 'SET_USER_MEDIA';
const ADD_PEER = 'ADD_PEER';
const DELETE_PEER = 'DELETE_PEER';
const CLEAR_PEERS = 'CLEAR_PEERS';

/* --------------- ACTION CREATORS --------------- */

export const setUserMedia = (stream) => {
  return {
    type: SET_USER_MEDIA,
    stream
  };
};

export const addPeer = (peerId, peerConnection) => {
  return {
    type: ADD_PEER,
    peerId,
    peerConnection
  };
};

export const deletePeer = (peerId) => {
  return {
    type: DELETE_PEER,
    peerId
  };
};

export const clearPeers = () => {
  return {
    type: CLEAR_PEERS
  };
};

/* --------------- REDUCER --------------- */

export default function webrtcReducer (state = initialState, action) {
  switch (action.type) {
    case SET_USER_MEDIA:
      return { ...state, localMediaStream: action.stream };

    case ADD_PEER:
      return {
        ...state,
        peers: { ...state.peers, [action.peerId]: action.peerConnection }
      };

    case DELETE_PEER: {
      const peers = { ...state.peers };
      delete peers[action.peerId];
      return { ...state, peers };
    }

    case CLEAR_PEERS:
      // Keep localMediaStream; only drop peer connections / media-element maps.
      return { ...state, peers: {}, peerMediaElements: {} };

    default:
      return state;
  }
}
