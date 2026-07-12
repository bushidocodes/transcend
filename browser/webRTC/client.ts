import store from '../redux/store.ts';
import {
  setUserMedia,
  clearUserMedia,
  addPeer,
  deletePeer,
  clearPeers
} from '../redux/reducers/webrtc-reducer.ts';
import { EVENTS } from '../../shared/protocol.ts';
import { getSocket } from '../socket-holder.ts';
import { isTerminalConnectionState, reservePeerSlot } from './peer-guards.ts';

/* ---------- signaling payload shapes (see shared/protocol.ts for the events) ---------- */

interface AddPeerConfig {
  peer_id: string;
  should_create_offer?: boolean;
}

interface RemovePeerConfig {
  peer_id: string;
}

interface SessionDescriptionConfig {
  peer_id: string;
  session_description: RTCSessionDescriptionInit;
}

interface IceCandidateConfig {
  peer_id: string;
  ice_candidate: RTCIceCandidateInit;
}

// Opt-in debug logging for WebRTC signaling noise. Enable in the browser console with:
//   (globalThis as any).__WEBRTC_DEBUG__ = true
const webrtcDebug = (...a: unknown[]) => {
  if ((globalThis as any).__WEBRTC_DEBUG__) console.log(...a);
};

let cachedIceServers: RTCIceServer[] | null = null;

// If the backend is unreachable, fall back to a public STUN server so peering still works on
// non-symmetric NATs rather than failing silently. (TURN-only networks still won't connect,
// but that's no worse than a missing config — and better than an unhandled rejection.)
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

async function getIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers) return cachedIceServers;
  try {
    const res = await fetch('/api/ice-servers');
    if (!res.ok) throw new Error(`GET /api/ice-servers responded ${res.status}`);
    const { iceServers } = await res.json();
    if (!iceServers) throw new Error('GET /api/ice-servers returned no iceServers');
    cachedIceServers = iceServers;
    return iceServers;
  } catch (err) {
    // Don't cache the fallback — a later peer may succeed once the endpoint recovers.
    console.error('Could not load ICE servers, falling back to public STUN:', err);
    return FALLBACK_ICE_SERVERS;
  }
}

// Module-level registries for non-serializable WebRTC objects (issue #176). Redux only stores
// peer ids + a hasLocalMedia flag; these maps hold the real MediaStream / RTCPeerConnection /
// <audio> element instances.
let localMediaStream: MediaStream | null = null;
const peers: Record<string, RTCPeerConnection> = {};
// Peer ids currently inside addPeerConn between the guard and peers[id] assignment (issue #231).
// Without this, two concurrent ADD_PEER events both pass `if (peers[peerId])` during the
// await getIceServers() gap and the first RTCPeerConnection is leaked.
const inFlightPeers = new Set<string>();
let peerMediaElements: Record<string, HTMLAudioElement> = {};

export function getLocalMediaStream(): MediaStream | null {
  return localMediaStream;
}

// Stop local microphone tracks and clear the module stream + Redux flag. Safe only on a
// terminal teardown (sessionReplaced, logout) — NOT on a transient disconnect, where the
// stream is reused on reconnect.
export function releaseLocalMediaStream(): void {
  if (localMediaStream && localMediaStream.getTracks) {
    localMediaStream.getTracks().forEach(track => track.stop());
  }
  localMediaStream = null;
  store.dispatch(clearUserMedia());
}

// Called by an A-Frame Room's componentDidMount hook, the joinChatRoom function asks the user
//   for access to their audio stream (if needed), and then emits the 'joinChatRoom' event which
//   causes the server to:
//   --Join the client to a socket.io room matching the string passed in.
//   --Instructs all clients in the same room to initiate WebRTC peer-to-peer voice connections
// If the user decides not to share their microphone, they are presented with an error
//   informing them that voice is unavailable.

export function joinChatRoom(room: string | null, errorback?: () => void): void {
  // Do not dump store.getState() here — it retains MediaStream / RTCPeerConnection refs in
  // the console (issue #180). Use module-level localMediaStream (issue #176).

  if (!room) {
    webrtcDebug('No room was provided');
    return;
  }
  if (localMediaStream != null) {
    /* ie, if we've already been initialized */
    getSocket()?.emit(EVENTS.JOIN_CHAT_ROOM, room);
    return;
  }
  webrtcDebug('Requesting access to local audio / video inputs');
  // navigator.mediaDevices.getUserMedia (Promise-based) replaces the removed callback-style
  // navigator.getUserMedia / webkitGetUserMedia (issue #77).
  navigator.mediaDevices
    .getUserMedia({ audio: true, video: false })
    // On Success
    .then(stream => {
      webrtcDebug('Access granted to audio');
      // Register the non-serializable stream here first, then flag Redux.
      localMediaStream = stream;
      store.dispatch(setUserMedia());
      const audioEl = document.getElementById('localAudio') as HTMLAudioElement;
      audioEl.muted = true;
      audioEl.srcObject = stream;
      getSocket()?.emit(EVENTS.JOIN_CHAT_ROOM, room);
    })
    // On Failure... likely because user denied access to a/v
    .catch(() => {
      webrtcDebug('Access denied for audio/video');
      window.alert(
        'You chose not to provide access to your microphone, so real-time voice chat is unavailable.'
      );
      if (errorback) errorback();
    });
}

// Called by a A-Frame Room's componentWillUnmount lifecycle hook, it leaveChatRoom
//   triggers server-side logic to leave the matching socket.io room and tear down
//   existing WebRTC connections.
export function leaveChatRoom(): void {
  // Null pre-init (socket-holder.ts contract) — leaving a room you could never have joined
  // is a no-op, not a crash.
  getSocket()?.emit(EVENTS.LEAVE_CHAT_ROOM);
}

// accepts conifg
export async function addPeerConn(config: AddPeerConfig): Promise<void> {
  webrtcDebug('Signaling server said to add peer:', config);
  const peerId = config.peer_id;
  // Reserve before any await so concurrent ADD_PEER for the same id cannot double-create
  // (issue #231). inFlightPeers covers the gap until peers[peerId] is set below.
  if (!reservePeerSlot(peerId, peers, inFlightPeers)) {
    webrtcDebug('Already connected (or connecting) to peer ', peerId);
    return;
  }

  try {
    const iceServers = await getIceServers();

    // Create a webRTC peer connection to the ICE servers. Unprefixed RTCPeerConnection
    // replaces the removed webkitRTCPeerConnection; the legacy second constraints argument
    // (DtlsSrtpKeyAgreement) is obsolete now that DTLS-SRTP is mandatory (issue #77).
    const peerConnection = new RTCPeerConnection({ iceServers });

    // I'm not 100% sure what this does, but it sets up ice candidates ¯\_(ツ)_/¯
    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        getSocket()?.emit(EVENTS.RELAY_ICE_CANDIDATE, {
          peer_id: peerId,
          ice_candidate: {
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            candidate: event.candidate.candidate
          }
        });
      }
    };

    // When we receive a peer's WebRTC track, add an audio tag to the DOM with an ID equal to
    //   the peerID, and set it to autoplay. ontrack replaces the removed onaddstream; its event
    //   carries a streams array rather than a single stream (issue #77).
    peerConnection.ontrack = event => {
      webrtcDebug('onTrack', event);
      // A connection can fire ontrack more than once; reuse the element we already made.
      let remoteAudio = peerMediaElements[peerId];
      if (!remoteAudio) {
        remoteAudio = document.createElement('audio');
        remoteAudio.setAttribute('id', peerId);
        remoteAudio.setAttribute('autoplay', 'autoplay');
        document.getElementsByTagName('body')[0].appendChild(remoteAudio);
        peerMediaElements[peerId] = remoteAudio; // map of all peer WebRTC streams
      }
      remoteAudio.srcObject = event.streams[0];
    };

    // Tear down on terminal connection states (ICE/network failure) so dead RTCPeerConnections
    // do not leak in the module-level peers map forever (issue #231).
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      webrtcDebug('connectionstatechange', peerId, state);
      if (isTerminalConnectionState(state)) {
        console.warn(`WebRTC peer ${peerId} entered terminal state: ${state}`);
        removePeerConn({ peer_id: peerId });
      }
    };

    /* Add our local stream's tracks. addTrack replaces the removed addStream. */
    if (localMediaStream) {
      localMediaStream
        .getTracks()
        .forEach(track => peerConnection.addTrack(track, localMediaStream!));
    }

    // Register the peer before negotiating so an incoming answer / ICE candidate can find it.
    peers[peerId] = peerConnection;
    store.dispatch(addPeer(peerId));

    /* Only one side of the peer connection should create the
     * offer, the signaling server picks one to be the offerer.
     * The other user will get a 'sessionDescription' event and will
     * create an offer, then send back an answer 'sessionDescription' to us
     */
    if (config.should_create_offer) {
      webrtcDebug('Creating RTC offer to ', peerId);
      try {
        const localDescription = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(localDescription);
        getSocket()?.emit(EVENTS.RELAY_SESSION_DESCRIPTION, {
          peer_id: peerId,
          session_description: localDescription
        });
        webrtcDebug('Offer setLocalDescription succeeded');
      } catch (error) {
        console.error('Error creating/sending offer: ', error);
      }
    }
  } catch (error) {
    // If setup fails after reserve, drop the in-flight claim so a later ADD_PEER can retry.
    console.error('addPeerConn failed for', peerId, error);
    delete peers[peerId];
  } finally {
    inFlightPeers.delete(peerId);
  }
}

export function removePeerConn(config: RemovePeerConfig): void {
  webrtcDebug('Signaling server said to remove peer:', config);
  const peerId = config.peer_id;
  inFlightPeers.delete(peerId);
  if (peerId in peerMediaElements) {
    peerMediaElements[peerId].remove();
  }
  if (peers[peerId]) {
    // Drop the handler first so peer.close() → 'closed' does not re-enter removePeerConn.
    peers[peerId].onconnectionstatechange = null;
    peers[peerId].close();
    delete peers[peerId];
  }
  store.dispatch(deletePeer(peerId));
  // Use the extracted peerId (snake_case config.peer_id). config.peerId is always undefined,
  // so the old delete was a no-op that leaked a detached <audio> reference per disconnect (#76).
  delete peerMediaElements[peerId];
}

export async function setRemoteAnswer(config: SessionDescriptionConfig): Promise<void> {
  webrtcDebug('Remote description received: ', config);
  const peerId = config.peer_id;
  const peer = peers[peerId];
  if (!peer) {
    console.error('setRemoteAnswer: no peer for', peerId);
    return;
  }
  const remoteDescription = config.session_description;
  // The modern Promise-based API accepts the plain RTCSessionDescriptionInit directly, so the
  // deprecated RTCSessionDescription wrapper and callback forms are gone (issue #77).
  try {
    await peer.setRemoteDescription(remoteDescription);
    webrtcDebug('setRemoteDescription succeeded');
    if (remoteDescription.type === 'offer') {
      webrtcDebug('Creating answer');
      const localDescription = await peer.createAnswer();
      await peer.setLocalDescription(localDescription);
      getSocket()?.emit(EVENTS.RELAY_SESSION_DESCRIPTION, {
        peer_id: peerId,
        session_description: localDescription
      });
      webrtcDebug('Answer setLocalDescription succeeded');
    }
  } catch (error) {
    console.error('setRemoteAnswer error: ', error);
  }
}

export async function setIceCandidate(config: IceCandidateConfig): Promise<void> {
  const peer = peers[config.peer_id];
  if (!peer) {
    console.error('setIceCandidate: no peer for', config.peer_id);
    return;
  }
  // addIceCandidate accepts the plain RTCIceCandidateInit directly; the deprecated
  // RTCIceCandidate wrapper is no longer needed (issue #77).
  try {
    await peer.addIceCandidate(config.ice_candidate);
  } catch (error) {
    console.error('addIceCandidate error: ', error);
  }
}

export function disconnectUser(): void {
  for (const peerId in peerMediaElements) {
    peerMediaElements[peerId].remove();
  }
  Object.keys(peers).forEach(peerId => {
    peers[peerId].onconnectionstatechange = null;
    peers[peerId].close();
    delete peers[peerId];
  });
  inFlightPeers.clear();
  store.dispatch(clearPeers());
  peerMediaElements = {};
}
