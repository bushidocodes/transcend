// Pure helpers extracted from the WebRTC client so the await-gap reservation and terminal
// connection-state rules can be unit-tested without RTCPeerConnection (issue #231).

/** True when the peer slot is already taken or a create is already in flight for this id. */
export function isPeerReserved(
  peerId: string,
  peers: Record<string, unknown>,
  inFlight: ReadonlySet<string>
): boolean {
  return peerId in peers || inFlight.has(peerId);
}

/**
 * Synchronously claim a peer id before any async work. Returns false if already reserved
 * (caller should abort). On success the id is added to `inFlight` until the peer is fully
 * registered or the attempt is abandoned.
 */
export function reservePeerSlot(
  peerId: string,
  peers: Record<string, unknown>,
  inFlight: Set<string>
): boolean {
  if (isPeerReserved(peerId, peers, inFlight)) return false;
  inFlight.add(peerId);
  return true;
}

/** RTCPeerConnection.connectionState values that mean the connection is dead and must go. */
export function isTerminalConnectionState(state: string): boolean {
  return state === 'failed' || state === 'closed';
}
