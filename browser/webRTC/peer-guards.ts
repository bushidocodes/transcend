// Pure helpers extracted from the WebRTC client so the await-gap reservation and terminal
// connection-state rules can be unit-tested without RTCPeerConnection (issue #231).

/** Monotonic token so a re-ADD after REMOVE does not look like the same reservation. */
let nextReservationToken = 1;

/** True when the peer slot is already taken or a create is already in flight for this id. */
export function isPeerReserved(
  peerId: string,
  peers: Record<string, unknown>,
  inFlight: ReadonlyMap<string, number>
): boolean {
  return peerId in peers || inFlight.has(peerId);
}

/**
 * Synchronously claim a peer id before any async work. Returns a reservation token on
 * success, or false if already reserved (caller should abort). Hold the token across any
 * await and re-check with `isReservationHeld` so an intervening remove (or a newer reserve)
 * cannot leave a half-built RTCPeerConnection registered.
 */
export function reservePeerSlot(
  peerId: string,
  peers: Record<string, unknown>,
  inFlight: Map<string, number>
): number | false {
  if (isPeerReserved(peerId, peers, inFlight)) return false;
  const token = nextReservationToken++;
  inFlight.set(peerId, token);
  return token;
}

/** True when `token` is still the active in-flight claim for `peerId`. */
export function isReservationHeld(
  peerId: string,
  inFlight: ReadonlyMap<string, number>,
  token: number
): boolean {
  return inFlight.get(peerId) === token;
}

/**
 * Drop an in-flight claim. When `token` is provided, only that reservation is cleared so a
 * newer concurrent reserve is not wiped by a stale finally block.
 */
export function releasePeerReservation(
  peerId: string,
  inFlight: Map<string, number>,
  token?: number
): void {
  if (token === undefined || inFlight.get(peerId) === token) {
    inFlight.delete(peerId);
  }
}

/** RTCPeerConnection.connectionState values that mean the connection is dead and must go. */
export function isTerminalConnectionState(state: string): boolean {
  return state === 'failed' || state === 'closed';
}
