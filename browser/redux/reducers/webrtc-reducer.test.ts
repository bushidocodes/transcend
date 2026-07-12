// Pure reducer tests for the serializable WebRTC slice (issue #176).
// clearUserMedia is required so logout can clear hasLocalMedia (issue #172).

import type { UnknownAction } from 'redux';
import webrtcReducer, {
  setUserMedia,
  clearUserMedia,
  addPeer,
  deletePeer,
  clearPeers,
  type WebrtcState
} from './webrtc-reducer.ts';

const asAction = (a: object): UnknownAction => a as UnknownAction;

const empty: WebrtcState = { peerIds: [], hasLocalMedia: false };

describe('webrtcReducer', () => {
  it('returns the initial state for an unknown action', () => {
    expect(webrtcReducer(undefined, { type: '@@INIT' })).toEqual(empty);
  });

  it('setUserMedia sets hasLocalMedia true without storing a stream', () => {
    const next = webrtcReducer(empty, asAction(setUserMedia()));
    expect(next).toEqual({ peerIds: [], hasLocalMedia: true });
    // Action payload must stay serializable — no stream field.
    expect(setUserMedia()).toEqual({ type: 'SET_USER_MEDIA' });
  });

  it('clearUserMedia clears the hasLocalMedia flag', () => {
    const withMedia = webrtcReducer(empty, asAction(setUserMedia()));
    expect(webrtcReducer(withMedia, asAction(clearUserMedia()))).toEqual(empty);
  });

  it('addPeer appends a peer id (and is idempotent)', () => {
    const one = webrtcReducer(empty, asAction(addPeer('peer-a')));
    expect(one.peerIds).toEqual(['peer-a']);
    const same = webrtcReducer(one, asAction(addPeer('peer-a')));
    expect(same.peerIds).toEqual(['peer-a']);
    const two = webrtcReducer(one, asAction(addPeer('peer-b')));
    expect(two.peerIds).toEqual(['peer-a', 'peer-b']);
  });

  it('deletePeer removes a peer id and is a no-op for unknown ids', () => {
    const state = webrtcReducer(
      webrtcReducer(empty, asAction(addPeer('peer-a'))),
      asAction(addPeer('peer-b'))
    );
    expect(webrtcReducer(state, asAction(deletePeer('peer-a'))).peerIds).toEqual(['peer-b']);
    expect(webrtcReducer(state, asAction(deletePeer('nobody'))).peerIds).toEqual([
      'peer-a',
      'peer-b'
    ]);
  });

  it('clearPeers drops peer ids but keeps hasLocalMedia', () => {
    let state = webrtcReducer(empty, asAction(setUserMedia()));
    state = webrtcReducer(state, asAction(addPeer('peer-a')));
    state = webrtcReducer(state, asAction(addPeer('peer-b')));
    const cleared = webrtcReducer(state, asAction(clearPeers()));
    expect(cleared).toEqual({ peerIds: [], hasLocalMedia: true });
  });

  it('state shape is fully serializable (JSON round-trip)', () => {
    let state = webrtcReducer(empty, asAction(setUserMedia()));
    state = webrtcReducer(state, asAction(addPeer('abc')));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
