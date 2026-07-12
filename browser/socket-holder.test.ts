/**
 * Unit tests for the socket singleton holder (issue #120 / #199).
 *
 * clearSocket must disconnect and null the instance so initSocket can open a fresh
 * Engine.IO handshake on the next login.
 */

import { getSocket, setSocket, clearSocket } from './socket-holder.ts';
import type { Socket } from 'socket.io-client';

function mockSocket (): Socket & { disconnect: ReturnType<typeof vi.fn> } {
  return {
    disconnect: vi.fn()
  } as unknown as Socket & { disconnect: ReturnType<typeof vi.fn> };
}

describe('socket-holder (issue #199)', function () {
  afterEach(function () {
    // Ensure the module singleton does not leak across tests.
    clearSocket();
  });

  it('clearSocket disconnects and nulls the singleton', function () {
    const s = mockSocket();
    setSocket(s);
    expect(getSocket()).toBe(s);

    clearSocket();

    expect(s.disconnect).toHaveBeenCalledOnce();
    expect(getSocket()).toBeNull();
  });

  it('clearSocket is a safe no-op when no socket exists', function () {
    expect(getSocket()).toBeNull();
    expect(function () { clearSocket(); }).not.toThrow();
    expect(getSocket()).toBeNull();
  });
});
