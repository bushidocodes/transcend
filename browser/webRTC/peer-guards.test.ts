// Unit tests for the pure WebRTC peer reservation / terminal-state helpers (issue #231).
// describe/it/expect are Vitest globals (test.globals).

import {
  isPeerReserved,
  isReservationHeld,
  isTerminalConnectionState,
  releasePeerReservation,
  reservePeerSlot
} from './peer-guards.ts';

describe('peer-guards (issue #231)', () => {
  describe('isPeerReserved / reservePeerSlot', () => {
    it('reports reserved when the peer already exists in peers', () => {
      const peers: Record<string, unknown> = { p1: {} };
      const inFlight = new Map<string, number>();
      expect(isPeerReserved('p1', peers, inFlight)).toBe(true);
      expect(isPeerReserved('p2', peers, inFlight)).toBe(false);
    });

    it('reports reserved when the peer id is already in-flight', () => {
      const peers: Record<string, unknown> = {};
      const inFlight = new Map([['p1', 1]]);
      expect(isPeerReserved('p1', peers, inFlight)).toBe(true);
    });

    it('reserves a free slot and blocks a concurrent second reserve', () => {
      const peers: Record<string, unknown> = {};
      const inFlight = new Map<string, number>();
      const token = reservePeerSlot('p1', peers, inFlight);
      expect(token).not.toBe(false);
      expect(inFlight.has('p1')).toBe(true);
      // Second concurrent ADD_PEER for the same id must fail the reserve (await-gap race).
      expect(reservePeerSlot('p1', peers, inFlight)).toBe(false);
    });

    it('does not reserve when peers already has the id', () => {
      const peers: Record<string, unknown> = { p1: {} };
      const inFlight = new Map<string, number>();
      expect(reservePeerSlot('p1', peers, inFlight)).toBe(false);
      expect(inFlight.has('p1')).toBe(false);
    });

    it('aborts after await when remove released the reservation (residual race)', () => {
      const peers: Record<string, unknown> = {};
      const inFlight = new Map<string, number>();
      const token = reservePeerSlot('p1', peers, inFlight);
      expect(token).not.toBe(false);
      // Intervening REMOVE clears the claim before the first ADD finishes its await.
      releasePeerReservation('p1', inFlight);
      expect(isReservationHeld('p1', inFlight, token as number)).toBe(false);
    });

    it('token release does not wipe a newer reservation for the same id', () => {
      const peers: Record<string, unknown> = {};
      const inFlight = new Map<string, number>();
      const first = reservePeerSlot('p1', peers, inFlight) as number;
      releasePeerReservation('p1', inFlight);
      const second = reservePeerSlot('p1', peers, inFlight) as number;
      expect(second).not.toBe(first);
      // Stale finally from the first attempt must not clear the second claim.
      releasePeerReservation('p1', inFlight, first);
      expect(isReservationHeld('p1', inFlight, second)).toBe(true);
      releasePeerReservation('p1', inFlight, second);
      expect(inFlight.has('p1')).toBe(false);
    });
  });

  describe('isTerminalConnectionState', () => {
    it('treats failed and closed as terminal', () => {
      expect(isTerminalConnectionState('failed')).toBe(true);
      expect(isTerminalConnectionState('closed')).toBe(true);
    });

    it('does not treat connecting/connected/disconnected as terminal', () => {
      expect(isTerminalConnectionState('new')).toBe(false);
      expect(isTerminalConnectionState('connecting')).toBe(false);
      expect(isTerminalConnectionState('connected')).toBe(false);
      expect(isTerminalConnectionState('disconnected')).toBe(false);
    });
  });
});
