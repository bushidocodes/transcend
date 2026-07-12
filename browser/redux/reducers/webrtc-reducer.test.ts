// Pure reducer tests for the current (master) webrtc slice API (issue #175).
// Non-serializable MediaStream / RTCPeerConnection payloads are mocked as plain objects
// so the reducer path can be exercised without a real browser WebRTC stack.

import type { UnknownAction } from 'redux';
import webrtcReducer, {
  setUserMedia,
  addPeer,
  deletePeer,
  clearPeers,
  type WebrtcState
} from './webrtc-reducer.ts';

const asAction = (a: object): UnknownAction => a as UnknownAction;

const empty: WebrtcState = {
  localMediaStream: null,
  peers: {},
  peerMediaElements: {}
};

// Stand-ins for the non-serializable objects the current reducer stores.
const fakeStream = { id: 'stream-1' } as unknown as MediaStream;
const fakePeerA = { id: 'pc-a' } as unknown as RTCPeerConnection;
const fakePeerB = { id: 'pc-b' } as unknown as RTCPeerConnection;

describe('webrtcReducer', () => {
  it('returns the initial state for an unknown action', () => {
    expect(webrtcReducer(undefined, { type: '@@INIT' })).toEqual(empty);
  });

  it('setUserMedia stores the local media stream', () => {
    const next = webrtcReducer(empty, asAction(setUserMedia(fakeStream)));
    expect(next.localMediaStream).toBe(fakeStream);
    expect(next.peers).toEqual({});
  });

  it('addPeer registers a peer connection under its id', () => {
    const one = webrtcReducer(empty, asAction(addPeer('peer-a', fakePeerA)));
    expect(one.peers).toEqual({ 'peer-a': fakePeerA });
    const two = webrtcReducer(one, asAction(addPeer('peer-b', fakePeerB)));
    expect(two.peers).toEqual({ 'peer-a': fakePeerA, 'peer-b': fakePeerB });
  });

  it('deletePeer removes a peer and is a no-op for unknown ids', () => {
    const state = webrtcReducer(
      webrtcReducer(empty, asAction(addPeer('peer-a', fakePeerA))),
      asAction(addPeer('peer-b', fakePeerB))
    );
    expect(webrtcReducer(state, asAction(deletePeer('peer-a'))).peers).toEqual({ 'peer-b': fakePeerB });
    expect(webrtcReducer(state, asAction(deletePeer('nobody'))).peers).toEqual(state.peers);
  });

  it('clearPeers drops peers and peerMediaElements but keeps localMediaStream', () => {
    let state = webrtcReducer(empty, asAction(setUserMedia(fakeStream)));
    state = webrtcReducer(state, asAction(addPeer('peer-a', fakePeerA)));
    // Simulate a stale peerMediaElements entry (field is currently unused by the app).
    state = { ...state, peerMediaElements: { 'peer-a': {} as HTMLMediaElement } };
    const cleared = webrtcReducer(state, asAction(clearPeers()));
    expect(cleared).toEqual({
      localMediaStream: fakeStream,
      peers: {},
      peerMediaElements: {}
    });
  });

  it('action creators shape actions correctly', () => {
    expect(setUserMedia(fakeStream)).toEqual({ type: 'SET_USER_MEDIA', stream: fakeStream });
    expect(addPeer('x', fakePeerA)).toEqual({
      type: 'ADD_PEER',
      peerId: 'x',
      peerConnection: fakePeerA
    });
    expect(deletePeer('x')).toEqual({ type: 'DELETE_PEER', peerId: 'x' });
    expect(clearPeers()).toEqual({ type: 'CLEAR_PEERS' });
  });
});
