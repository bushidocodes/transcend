// Unit tests for the pure WebRTC peer reservation / terminal-state helpers (issue #231).
// describe/it/expect are Vitest globals (test.globals).

import { isPeerReserved, isTerminalConnectionState, reservePeerSlot } from './peer-guards.ts';

describe('peer-guards (issue #231)', () => {
  describe('isPeerReserved / reservePeerSlot', () => {
    it('reports reserved when the peer already exists in peers', () => {
      const peers: Record<string, unknown> = { p1: {} };
      const inFlight = new Set<string>();
      expect(isPeerReserved('p1', peers, inFlight)).toBe(true);
      expect(isPeerReserved('p2', peers, inFlight)).toBe(false);
    });

    it('reports reserved when the peer id is already in-flight', () => {
      const peers: Record<string, unknown> = {};
      const inFlight = new Set(['p1']);
      expect(isPeerReserved('p1', peers, inFlight)).toBe(true);
    });

    it('reserves a free slot and blocks a concurrent second reserve', () => {
      const peers: Record<string, unknown> = {};
      const inFlight = new Set<string>();
      expect(reservePeerSlot('p1', peers, inFlight)).toBe(true);
      expect(inFlight.has('p1')).toBe(true);
      // Second concurrent ADD_PEER for the same id must fail the reserve (await-gap race).
      expect(reservePeerSlot('p1', peers, inFlight)).toBe(false);
    });

    it('does not reserve when peers already has the id', () => {
      const peers: Record<string, unknown> = { p1: {} };
      const inFlight = new Set<string>();
      expect(reservePeerSlot('p1', peers, inFlight)).toBe(false);
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
