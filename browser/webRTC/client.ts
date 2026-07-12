import store from '../redux/store.ts';
import { setUserMedia, addPeer, deletePeer, clearPeers } from '../redux/reducers/webrtc-reducer.ts';
import { EVENTS } from '../../shared/protocol.ts';
import { getSocket } from '../socket-holder.ts';

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

let cachedIceServers: RTCIceServer[] | null = null;

// If the backend is unreachable, fall back to a public STUN server so peering still works on
// non-symmetric NATs rather than failing silently. (TURN-only networks still won't connect,
// but that's no worse than a missing config — and better than an unhandled rejection.)
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

async function getIceServers (): Promise<RTCIceServer[]> {
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

let peerMediaElements: Record<string, HTMLAudioElement> = {};  // keep track of our <audio> tags, indexed by peer_id

// Called by an A-Frame Room's componentDidMount hook, the joinChatRoom function asks the user
//   for access to their audio stream (if needed), and then emits the 'joinChatRoom' event which
//   causes the server to:
//   --Join the client to a socket.io room matching the string passed in.
//   --Instructs all clients in the same room to initiate WebRTC peer-to-peer voice connections
// If the user decides not to share their microphone, they are presented with an error
//   informing them that voice is unavailable.

export function joinChatRoom (room: string | null, errorback?: () => void): void {
  // Get our microphone from the state
  console.log(store.getState());
  const localMediaStream = store.getState().webrtc.localMediaStream;

  if (!room) {
    console.log('No room was provided');
    return;
  }
  if (localMediaStream != null) {  /* ie, if we've already been initialized */
    getSocket()!.emit(EVENTS.JOIN_CHAT_ROOM, room);
    return;
  }
  console.log('Requesting access to local audio / video inputs');
  // navigator.mediaDevices.getUserMedia (Promise-based) replaces the removed callback-style
  // navigator.getUserMedia / webkitGetUserMedia (issue #77).
  navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    // On Success
    .then(stream => {
      console.log('Access granted to audio');
      store.dispatch(setUserMedia(stream));
      const audioEl = document.getElementById('localAudio') as HTMLAudioElement;
      audioEl.muted = true;
      audioEl.srcObject = stream;
      getSocket()!.emit(EVENTS.JOIN_CHAT_ROOM, room);
    })
    // On Failure... likely because user denied access to a/v
    .catch(() => {
      console.log('Access denied for audio/video');
      window.alert('You chose not to provide access to your microphone, so real-time voice chat is unavailable.');
      if (errorback) errorback();
    });
}

// Called by a A-Frame Room's componentWillUnmount lifecycle hook, it leaveChatRoom
//   triggers server-side logic to leave the matching socket.io room and tear down
//   existing WebRTC connections.
export function leaveChatRoom (): void {
  getSocket()!.emit(EVENTS.LEAVE_CHAT_ROOM);
}

// accepts conifg
export async function addPeerConn (config: AddPeerConfig): Promise<void> {
  console.log('Signaling server said to add peer:', config);
  const peerId = config.peer_id;
  const peers = store.getState().webrtc.peers;
  // If for some reason, this client aready is connected to the peer, return
  if (peers[peerId]) {
    console.log('Already connected to peer ', peerId);
    return;
  }

  const iceServers = await getIceServers();

  // Create a webRTC peer connection to the ICE servers. Unprefixed RTCPeerConnection
  // replaces the removed webkitRTCPeerConnection; the legacy second constraints argument
  // (DtlsSrtpKeyAgreement) is obsolete now that DTLS-SRTP is mandatory (issue #77).
  const peerConnection = new RTCPeerConnection({ iceServers });

  // I'm not 100% sure what this does, but it sets up ice candidates ¯\_(ツ)_/¯
  peerConnection.onicecandidate = function (event) {
    if (event.candidate) {
      getSocket()!.emit(EVENTS.RELAY_ICE_CANDIDATE, {
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
  peerConnection.ontrack = function (event) {
    console.log('onTrack', event);
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

  /* Add our local stream's tracks. addTrack replaces the removed addStream. */
  const localMediaStream = store.getState().webrtc.localMediaStream!;
  localMediaStream.getTracks().forEach(track => peerConnection.addTrack(track, localMediaStream));

  // Register the peer before negotiating so an incoming answer / ICE candidate can find it.
  store.dispatch(addPeer(peerId, peerConnection));

  /* Only one side of the peer connection should create the
  * offer, the signaling server picks one to be the offerer.
  * The other user will get a 'sessionDescription' event and will
  * create an offer, then send back an answer 'sessionDescription' to us
  */
  if (config.should_create_offer) {
    console.log('Creating RTC offer to ', peerId);
    try {
      const localDescription = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(localDescription);
      getSocket()!.emit(EVENTS.RELAY_SESSION_DESCRIPTION,
        { peer_id: peerId, session_description: localDescription });
      console.log('Offer setLocalDescription succeeded');
    } catch (error) {
      console.error('Error creating/sending offer: ', error);
    }
  }
}

export function removePeerConn (config: RemovePeerConfig): void {
  console.log('Signaling server said to remove peer:', config);
  const peerId = config.peer_id;
  if (peerId in peerMediaElements) {
    peerMediaElements[peerId].remove();
  }
  const peers = store.getState().webrtc.peers;
  if (peers[peerId]) {
    peers[peerId].close();
  }
  store.dispatch(deletePeer(peerId));
  // Use the extracted peerId (snake_case config.peer_id). config.peerId is always undefined,
  // so the old delete was a no-op that leaked a detached <audio> reference per disconnect (#76).
  delete peerMediaElements[peerId];
}

export async function setRemoteAnswer (config: SessionDescriptionConfig): Promise<void> {
  console.log('Remote description received: ', config);
  const peerId = config.peer_id;
  const peer = store.getState().webrtc.peers[peerId];
  const remoteDescription = config.session_description;
  // The modern Promise-based API accepts the plain RTCSessionDescriptionInit directly, so the
  // deprecated RTCSessionDescription wrapper and callback forms are gone (issue #77).
  try {
    await peer.setRemoteDescription(remoteDescription);
    console.log('setRemoteDescription succeeded');
    if (remoteDescription.type === 'offer') {
      console.log('Creating answer');
      const localDescription = await peer.createAnswer();
      await peer.setLocalDescription(localDescription);
      getSocket()!.emit(EVENTS.RELAY_SESSION_DESCRIPTION,
        { peer_id: peerId, session_description: localDescription });
      console.log('Answer setLocalDescription succeeded');
    }
  } catch (error) {
    console.error('setRemoteAnswer error: ', error);
  }
}

export async function setIceCandidate (config: IceCandidateConfig): Promise<void> {
  const peer = store.getState().webrtc.peers[config.peer_id];
  // addIceCandidate accepts the plain RTCIceCandidateInit directly; the deprecated
  // RTCIceCandidate wrapper is no longer needed (issue #77).
  try {
    await peer.addIceCandidate(config.ice_candidate);
  } catch (error) {
    console.error('addIceCandidate error: ', error);
  }
}

export function disconnectUser (): void {
  for (const peerId in peerMediaElements) {
    peerMediaElements[peerId].remove();
  }
  const peers = store.getState().webrtc.peers;
  Object.values(peers).forEach(peerConn => {
    peerConn.close();
  });
  store.dispatch(clearPeers());
  peerMediaElements = {};
}
