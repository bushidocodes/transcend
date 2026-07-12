/**
 * Integration tests for the socket.io multiplayer layer.
 *
 * Spins up a real HTTP + socket.io server using the actual server/socket.ts handler (including
 * the GameState container and the fixed-rate broadcast loop) and connects multiple
 * socket.io-client instances to simulate users interacting in the VR space.
 *
 * The Stage-3 handshake was collapsed (issue #69): a client now sends a single `joinScene`
 * (identity + room) and the server replies with one `sceneState` ({ you, others, tickRate });
 * the client then emits `ready` to begin receiving `usersUpdated` pushes. Room filtering (#58)
 * means `sceneState.others` and `usersUpdated` only contain users in the requester's room, and
 * `removeUser` is scoped to the departing user's room.
 *
 * Event names here are deliberately bare string literals, NOT the EVENTS constants from
 * shared/protocol.ts (#117): these clients stand in for already-deployed browsers, so they must
 * speak the exact wire strings. If a constant's value ever drifts, these tests fail — which is
 * the point.
 */

import http from 'http';
import type { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import socketClient, { type Socket as ClientSocket } from 'socket.io-client';
import attachSocketServer from './socket.ts';

// describe/it/expect/beforeAll/afterAll are provided as globals by Vitest (test.globals).

let server: http.Server;
let io: SocketIOServer;
let PORT: number;

// Optional mock Passport user injected for tests that need a real accountId (single-session
// #30). Production populates socket.request.user via express-session + passport on Engine.IO
// (issue #167); unit tests only call attachSocketServer(io), so handshake.auth.sessionUser
// stands in for a logged-in session.
type SessionUser = { id: number | string; displayName?: string; skin?: string };

beforeAll(
  () =>
    new Promise<void>(resolve => {
      server = http.createServer();
      io = new SocketIOServer(server, { cors: { origin: '*' } });
      io.use((socket, next) => {
        const auth = socket.handshake.auth as { sessionUser?: SessionUser } | undefined;
        if (auth && auth.sessionUser) {
          (socket.request as { user?: SessionUser }).user = auth.sessionUser;
        }
        next();
      });
      attachSocketServer(io);
      server.listen(0, () => {
        PORT = (server.address() as AddressInfo).port;
        resolve();
      });
    })
);

afterAll(() => new Promise(resolve => io.close(resolve)));

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

// Once 'connect' has fired the socket id is always set; modelling that here saves a
// non-null assertion at every `.id` use below.
type ConnectedClient = ClientSocket & { id: string };

function connect(sessionUser?: SessionUser): ConnectedClient {
  return socketClient('http://localhost:' + PORT, {
    transports: ['websocket'],
    forceNew: true,
    auth: sessionUser ? { sessionUser } : undefined
  }) as ConnectedClient;
}

// Deliberately Promise<any>: the resolved values are raw wire payloads whose exact runtime
// shape is what these tests pin down.
function waitFor(socket: ClientSocket, event: string, ms?: number): Promise<any> {
  ms = ms || 3000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for "' + event + '" (>' + ms + 'ms)'));
    }, ms);
    socket.once(event, (data: unknown) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanup(...clients: Array<ClientSocket | undefined>): Promise<void> {
  clients.forEach(c => {
    if (c && c.connected) c.disconnect();
  });
  return sleep(200);
}

// Single-message join: emit joinScene and resolve with the sceneState reply.
function handshake(
  client: ClientSocket,
  displayName: string,
  scene?: string,
  skin?: string
): Promise<any> {
  const ss = waitFor(client, 'sceneState');
  client.emit('joinScene', { displayName, skin: skin || 'default' }, scene || 'lobby');
  return ss;
}

// -----------------------------------------------------------------
// 1. Join / sceneState
// -----------------------------------------------------------------

describe('Socket.io – joinScene / sceneState', () => {
  it('replies with sceneState (own avatar, empty others, a tick rate) after joinScene', () => {
    const client = connect();
    return waitFor(client, 'connect')
      .then(() => handshake(client, 'Alice', 'lobby'))
      .then(state => {
        expect(Object.keys(state)).toEqual(expect.arrayContaining(['you', 'others', 'tickRate']));
        expect(state.you.id).toBe(client.id);
        expect(state.you.displayName).toBe('Alice');
        expect(state.you.y).toBe(1.3);
        expect(Object.keys(state.you)).toEqual(
          expect.arrayContaining(['x', 'y', 'z', 'xrot', 'yrot', 'zrot', 'scene'])
        );
        expect(state.you.scene).toBe('lobby'); // joinScene records the room up front
        expect(Object.keys(state.others)).toHaveLength(0);
        expect(typeof state.tickRate).toBe('number');
        expect(state.tickRate).toBeGreaterThan(0);
        return cleanup(client);
      });
  });

  it('initial rotation fields are all zero', () => {
    const client = connect();
    return waitFor(client, 'connect')
      .then(() => handshake(client, 'Bob', 'lobby', 'creeper'))
      .then(state => {
        expect(state.you.xrot).toBe(0);
        expect(state.you.yrot).toBe(0);
        expect(state.you.zrot).toBe(0);
        return cleanup(client);
      });
  });

  // Issue #227: joinScene must apply the same VALID_SKINS gate as changeSkin (#79 join-path gap).
  it('joinScene with a whitelisted skin stores that skin', () => {
    const client = connect();
    return waitFor(client, 'connect')
      .then(() => handshake(client, 'Alice', 'lobby', 'batman'))
      .then(state => {
        expect(state.you.skin).toBe('batman');
        return cleanup(client);
      });
  });

  it('joinScene with a non-whitelisted skin drops the skin (undefined)', () => {
    const client = connect();
    return waitFor(client, 'connect')
      .then(() => handshake(client, 'Alice', 'lobby', '../../evil; injected: true'))
      .then(state => {
        // Rejected rather than stored; browser will fall back to its default texture.
        expect(state.you.skin).toBeUndefined();
        return cleanup(client);
      });
  });

  it('joinScene with a session skin outside VALID_SKINS also drops the skin', () => {
    const client = connect({ id: 227, displayName: 'Sess', skin: 'not-a-real-skin' });
    return waitFor(client, 'connect')
      .then(() => {
        client.emit('joinScene', { displayName: 'Sess', skin: 'batman' }, 'lobby');
        return waitFor(client, 'sceneState');
      })
      .then(state => {
        // Session skin wins over client payload but must still pass the whitelist.
        expect(state.you.skin).toBeUndefined();
        return cleanup(client);
      });
  });
});

// -----------------------------------------------------------------
// 2. sceneState.others (the room's existing users)
// -----------------------------------------------------------------

describe('Socket.io – sceneState.others', () => {
  it('includes another user already in the room and excludes the requester', () => {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(() => handshake(cA, 'Alice', 'lobby'))
      .then(() => handshake(cB, 'Bob', 'lobby'))
      .then(stateB => {
        expect(stateB.others).toHaveProperty(cA.id);
        expect(stateB.others).not.toHaveProperty(cB.id);
        return cleanup(cA, cB);
      });
  });

  it('is empty when no other users are in the room', () => {
    const client = connect();
    return waitFor(client, 'connect')
      .then(() => handshake(client, 'Lone Wolf', 'lobby'))
      .then(state => {
        expect(Object.keys(state.others)).not.toContain(client.id);
        expect(Object.keys(state.others)).toHaveLength(0);
        return cleanup(client);
      });
  });
});

// -----------------------------------------------------------------
// 3. Real-time position sync (ready -> usersUpdated via the fixed-rate broadcast loop, #115)
// -----------------------------------------------------------------

describe('Socket.io – real-time position sync', () => {
  // Connect two clients, join both into the SAME room, subscribe both via `ready`.
  function withTwoSubscribers(
    body: (cA: ConnectedClient, cB: ConnectedClient) => Promise<unknown>
  ) {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(() => handshake(cA, 'Alice', 'lobby'))
      .then(() => handshake(cB, 'Bob', 'lobby'))
      .then(() => {
        cA.emit('ready');
        cB.emit('ready');
        return sleep(80); // let both subscriptions register
      })
      .then(() => body(cA, cB))
      .then(() => cleanup(cA, cB));
  }

  it('client B receives usersUpdated when client A emits a tick', () =>
    withTwoSubscribers((cA, cB) => {
      const updatesForB = waitFor(cB, 'usersUpdated');
      cA.emit('tick', {
        id: cA.id,
        x: 5,
        y: 1.3,
        z: -3,
        xrot: 0,
        yrot: 90,
        zrot: 0,
        skin: 'default',
        scene: 'lobby'
      });
      return updatesForB.then(users => {
        expect(users).toHaveProperty(cA.id);
        expect(users[cA.id].x).toBe(5);
        expect(users[cA.id].z).toBe(-3);
        expect(users[cA.id].yrot).toBe(90);
      });
    }));

  // Room broadcast sends the full scene snapshot once (issue #200). Clients skip their own
  // id in avatars.sync; the wire payload may include the recipient.
  it('usersUpdated room snapshot includes peers (and may include self)', () =>
    withTwoSubscribers((cA, cB) => {
      const updatesForB = waitFor(cB, 'usersUpdated');
      cA.emit('tick', {
        id: cA.id,
        x: 1,
        y: 1.3,
        z: 0,
        xrot: 0,
        yrot: 0,
        zrot: 0,
        skin: 'default',
        scene: 'lobby'
      });
      return updatesForB.then(users => {
        expect(users).toHaveProperty(cA.id);
        expect(users[cA.id].x).toBe(1);
      });
    }));

  it('both ready members receive the same room snapshot on a tick', () =>
    withTwoSubscribers((cA, cB) => {
      const updatesForA = waitFor(cA, 'usersUpdated');
      const updatesForB = waitFor(cB, 'usersUpdated');
      cB.emit('tick', {
        id: cB.id,
        x: 2,
        y: 1.3,
        z: 0,
        xrot: 0,
        yrot: 0,
        zrot: 0,
        skin: 'default',
        scene: 'lobby'
      });
      return Promise.all([updatesForA, updatesForB]).then(([usersA, usersB]) => {
        expect(usersA).toHaveProperty(cB.id);
        expect(usersB).toHaveProperty(cB.id);
        expect(usersA[cB.id].x).toBe(2);
        expect(usersB[cB.id].x).toBe(2);
      });
    }));

  it('all six position/rotation fields are propagated accurately', () =>
    withTwoSubscribers((cA, cB) => {
      const updatesForB = waitFor(cB, 'usersUpdated');
      cA.emit('tick', {
        id: cA.id,
        x: -7.5,
        y: 1.8,
        z: 12.3,
        xrot: 5,
        yrot: 270,
        zrot: -2,
        skin: 'steve',
        scene: 'lobby'
      });
      return updatesForB.then(users => {
        const a = users[cA.id];
        expect(a.x).toBe(-7.5);
        expect(a.y).toBe(1.8);
        expect(a.z).toBe(12.3);
        expect(a.xrot).toBe(5);
        expect(a.yrot).toBe(270);
        expect(a.zrot).toBe(-2);
        expect(a.scene).toBe('lobby');
      });
    }));

  it('successive ticks from A update B with the latest position each time', () =>
    withTwoSubscribers((cA, cB) => {
      const first = waitFor(cB, 'usersUpdated');
      cA.emit('tick', {
        id: cA.id,
        x: 1,
        y: 1.3,
        z: 0,
        xrot: 0,
        yrot: 0,
        zrot: 0,
        skin: 'default',
        scene: 'lobby'
      });
      return first
        .then(users => {
          expect(users[cA.id].x).toBe(1);
          const second = waitFor(cB, 'usersUpdated');
          cA.emit('tick', {
            id: cA.id,
            x: 99,
            y: 2.5,
            z: -50,
            xrot: 1,
            yrot: 180,
            zrot: 0,
            skin: 'default',
            scene: 'lobby'
          });
          return second;
        })
        .then(users => {
          expect(users[cA.id].x).toBe(99);
          expect(users[cA.id].y).toBe(2.5);
          expect(users[cA.id].yrot).toBe(180);
        });
    }));
});

// -----------------------------------------------------------------
// 4. Room filtering (issue #58)
// -----------------------------------------------------------------

describe('Socket.io – room filtering (#58)', () => {
  it('sceneState.others excludes a user in a different room', () => {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(() => handshake(cB, 'Bob', 'spaceroom')) // B in another room
      .then(() => handshake(cA, 'Alice', 'lobby'))
      .then(stateA => {
        expect(stateA.others).not.toHaveProperty(cB.id);
        return cleanup(cA, cB);
      });
  });

  it("usersUpdated does not deliver a different-room peer's tick", () => {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(() => handshake(cA, 'Alice', 'lobby'))
      .then(() => handshake(cB, 'Bob', 'spaceroom'))
      .then(() => {
        cA.emit('ready');
        cB.emit('ready');
        return sleep(80);
      })
      .then(() => {
        // Broadcasts are room-scoped and only fire for rooms whose state changed (#115), so B
        // may legitimately receive NOTHING here. Collect whatever does arrive and assert A's
        // tick never crossed the room boundary.
        const receivedByB: any[] = [];
        cB.on('usersUpdated', users => {
          receivedByB.push(users);
        });
        cA.emit('tick', {
          id: cA.id,
          x: 1,
          y: 1.3,
          z: 0,
          xrot: 0,
          yrot: 0,
          zrot: 0,
          skin: 'default',
          scene: 'lobby'
        });
        return sleep(250).then(() => receivedByB);
      })
      .then(receivedByB => {
        receivedByB.forEach(users => {
          expect(users).not.toHaveProperty(cA.id); // A is in lobby, B is in spaceroom
        });
        return cleanup(cA, cB);
      });
  });

  it("removeUser is sent only to clients in the departing user's room", () => {
    const cLobby1 = connect();
    const cLobby2 = connect();
    const cSpace = connect();

    return Promise.all([
      waitFor(cLobby1, 'connect'),
      waitFor(cLobby2, 'connect'),
      waitFor(cSpace, 'connect')
    ])
      .then(() => handshake(cLobby1, 'L1', 'lobby'))
      .then(() => handshake(cLobby2, 'L2', 'lobby'))
      .then(() => handshake(cSpace, 'S', 'spaceroom'))
      .then(() => {
        const leavingId = cLobby1.id;
        const sameRoomGotIt = waitFor(cLobby2, 'removeUser');
        let spaceGotIt = false;
        cSpace.once('removeUser', () => {
          spaceGotIt = true;
        });
        cLobby1.disconnect();
        return sameRoomGotIt
          .then(removedId => {
            expect(removedId).toBe(leavingId);
            return sleep(120);
          })
          .then(() => {
            expect(spaceGotIt).toBe(false);
            return cleanup(cLobby2, cSpace);
          });
      });
  });
});

// -----------------------------------------------------------------
// 5. Tick guard — a position tick must never CREATE a user (issue #56)
// -----------------------------------------------------------------

describe('Socket.io – tick guard (issue #56)', () => {
  it('a tick for an unregistered socket id does not create a ghost user', () => {
    const client = connect();
    const observer = connect();

    return Promise.all([waitFor(client, 'connect'), waitFor(observer, 'connect')])
      .then(() => handshake(client, 'Alice', 'lobby'))
      .then(() => {
        // A tick arriving under an id that never joined — the post-restart ghost.
        client.emit('tick', {
          id: 'ghost-stale-socket-id',
          x: 1,
          y: 1.3,
          z: 2,
          xrot: 0,
          yrot: 0,
          zrot: 0,
          skin: 'default',
          scene: 'lobby'
        });
        return sleep(100);
      })
      .then(() => {
        // A fresh joiner in the same room would see the ghost in sceneState.others if it had
        // been auto-created. It must not have been.
        return handshake(observer, 'Observer', 'lobby');
      })
      .then(state => {
        expect(state.others).not.toHaveProperty('ghost-stale-socket-id');
        expect(state.others).toHaveProperty(client.id); // the real user is there
        return cleanup(client, observer);
      });
  });
});

// -----------------------------------------------------------------
// 6. Disconnect / cleanup
// -----------------------------------------------------------------

describe('Socket.io – disconnect cleanup', () => {
  it('removes a disconnected user from subsequent sceneState.others', () => {
    const cA = connect();
    const cB = connect();
    let savedAId: string;

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(() => handshake(cA, 'Alice', 'lobby'))
      .then(() => {
        savedAId = cA.id;
        cA.disconnect();
        return sleep(150);
      })
      .then(() => handshake(cB, 'Bob', 'lobby'))
      .then(stateB => {
        expect(stateB.others).not.toHaveProperty(savedAId);
        return cleanup(cB);
      });
  });

  it('sends removeUser to same-room clients on disconnect', () => {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(() => handshake(cA, 'Alice', 'lobby'))
      .then(() => handshake(cB, 'Bob', 'lobby'))
      .then(() => {
        const savedAId = cA.id;
        const removePromise = waitFor(cB, 'removeUser');
        cA.disconnect();
        return removePromise.then(removedId => {
          expect(removedId).toBe(savedAId);
          return cleanup(cB);
        });
      });
  });

  it('keeps broadcasting to the survivors after a subscribed client disconnects', () => {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(() => handshake(cA, 'Alice', 'lobby'))
      .then(() => handshake(cB, 'Bob', 'lobby'))
      .then(() => {
        cA.emit('ready');
        return sleep(80);
      })
      .then(() => {
        cA.disconnect(); // socket.io drops it from the scene broadcast room
        return sleep(150);
      })
      .then(() => {
        cB.emit('ready');
        return sleep(50);
      })
      .then(() => {
        const updatesForB = waitFor(cB, 'usersUpdated');
        cB.emit('tick', {
          id: cB.id,
          x: 0,
          y: 1.3,
          z: 0,
          xrot: 0,
          yrot: 0,
          zrot: 0,
          skin: 'default',
          scene: 'lobby'
        });
        return updatesForB;
      })
      .then(() => {
        // Reaching here without a server crash means the broadcast loop handled the departed
        // socket cleanly and kept streaming to the survivor.
        return cleanup(cB);
      });
  });
});

// -----------------------------------------------------------------
// 6b. Fixed-rate broadcast loop (issue #115)
// -----------------------------------------------------------------

describe('Socket.io – fixed-rate broadcast loop (issue #115)', () => {
  it('a quiet room receives no usersUpdated traffic', () => {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(() => handshake(cA, 'Alice', 'lobby'))
      .then(() => handshake(cB, 'Bob', 'lobby'))
      .then(() => {
        cA.emit('ready');
        cB.emit('ready');
        // Let the join-triggered snapshots flush before we start counting.
        return sleep(200);
      })
      .then(() => {
        const received: any[] = [];
        cB.on('usersUpdated', users => {
          received.push(users);
        });
        return sleep(300).then(() => received);
      })
      .then(received => {
        // Nobody ticked, so the room never went dirty and the loop stayed silent — the old
        // per-dispatch subscription fan-out is gone.
        expect(received).toHaveLength(0);
        return cleanup(cA, cB);
      });
  });

  it('a burst of ticks inside one broadcast interval coalesces into fewer snapshots', () => {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(() => handshake(cA, 'Alice', 'lobby'))
      .then(() => handshake(cB, 'Bob', 'lobby'))
      .then(() => {
        cA.emit('ready');
        cB.emit('ready');
        return sleep(200); // flush join-triggered snapshots
      })
      .then(() => {
        const received: any[] = [];
        cB.on('usersUpdated', users => {
          received.push(users);
        });
        // 20 back-to-back ticks. Under the old per-dispatch fan-out B would get ~20
        // usersUpdated; under a 50ms broadcast clock they collapse into a handful of beats.
        for (let i = 1; i <= 20; i++) {
          cA.emit('tick', { x: i, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0 });
        }
        return sleep(400).then(() => received);
      })
      .then(received => {
        expect(received.length).toBeGreaterThan(0);
        expect(received.length).toBeLessThan(10);
        // The final snapshot carries the latest accumulated position.
        const last = received[received.length - 1];
        expect(last[cA.id].x).toBe(20);
        return cleanup(cA, cB);
      });
  });
});

// -----------------------------------------------------------------
// 7. Single active session per account (#30)
// -----------------------------------------------------------------

describe('Socket.io – single active session per account (#30)', () => {
  // Account identity for session replacement comes from socket.request.user (Passport
  // session / test handshake.auth.sessionUser), not from the joinScene payload (#167).
  it('disconnects the prior socket when the same account joins again', () => {
    const first = connect({ id: 42, displayName: 'Dup', skin: 'default' });
    let second: ConnectedClient;

    return waitFor(first, 'connect')
      .then(() => {
        first.emit('joinScene', { displayName: 'Dup', skin: 'default' }, 'lobby');
        return sleep(120);
      })
      .then(() => {
        second = connect({ id: 42, displayName: 'Dup', skin: 'default' });
        return waitFor(second, 'connect');
      })
      .then(() => {
        const firstClosed = waitFor(first, 'disconnect');
        second.emit('joinScene', { displayName: 'Dup', skin: 'default' }, 'lobby');
        return firstClosed;
      })
      .then(() => {
        expect(first.connected).toBe(false);
        expect(second.connected).toBe(true);
        return cleanup(second);
      });
  });

  it('emits sessionReplaced to the prior socket before disconnecting it', () => {
    const first = connect({ id: 88, displayName: 'Dup', skin: 'default' });
    let second: ConnectedClient;

    return waitFor(first, 'connect')
      .then(() => {
        first.emit('joinScene', { displayName: 'Dup', skin: 'default' }, 'lobby');
        return sleep(120);
      })
      .then(() => {
        second = connect({ id: 88, displayName: 'Dup', skin: 'default' });
        return waitFor(second, 'connect');
      })
      .then(() => {
        // The replaced client must hear sessionReplaced — that's the signal the browser
        // uses to stop being a live (locally-movable) zombie session and block its tab.
        const replaced = waitFor(first, 'sessionReplaced');
        second.emit('joinScene', { displayName: 'Dup', skin: 'default' }, 'lobby');
        return replaced;
      })
      .then(() => cleanup(second));
  });

  it('carries the prior session position forward to the takeover tab in the same room', () => {
    const first = connect({ id: 55, displayName: 'Mover', skin: 'default' });
    let second: ConnectedClient;

    return waitFor(first, 'connect')
      .then(() => {
        const ss = waitFor(first, 'sceneState');
        first.emit('joinScene', { displayName: 'Mover', skin: 'default' }, 'lobby');
        return ss;
      })
      .then(() => {
        // Walk the first session to a known spot.
        first.emit('tick', {
          id: first.id,
          x: 7,
          y: 1.3,
          z: -4,
          xrot: 0,
          yrot: 123,
          zrot: 0,
          skin: 'default',
          scene: 'lobby'
        });
        return sleep(80);
      })
      .then(() => {
        second = connect({ id: 55, displayName: 'Mover', skin: 'default' });
        return waitFor(second, 'connect');
      })
      .then(() => {
        const ss = waitFor(second, 'sceneState');
        second.emit('joinScene', { displayName: 'Mover', skin: 'default' }, 'lobby');
        return ss;
      })
      .then(state => {
        expect(state.you.x).toBe(7);
        expect(state.you.z).toBe(-4);
        expect(state.you.yrot).toBe(123);
        return cleanup(second);
      });
  });

  it('does NOT carry position across a takeover into a different room', () => {
    const first = connect({ id: 56, displayName: 'Mover', skin: 'default' });
    let second: ConnectedClient;

    return waitFor(first, 'connect')
      .then(() => {
        const ss = waitFor(first, 'sceneState');
        first.emit('joinScene', { displayName: 'Mover', skin: 'default' }, 'lobby');
        return ss;
      })
      .then(() => {
        first.emit('tick', {
          id: first.id,
          x: 7,
          y: 1.3,
          z: -4,
          xrot: 0,
          yrot: 0,
          zrot: 0,
          skin: 'default',
          scene: 'lobby'
        });
        return sleep(80);
      })
      .then(() => {
        second = connect({ id: 56, displayName: 'Mover', skin: 'default' });
        return waitFor(second, 'connect');
      })
      .then(() => {
        const ss = waitFor(second, 'sceneState');
        second.emit('joinScene', { displayName: 'Mover', skin: 'default' }, 'spaceroom');
        return ss;
      })
      .then(state => {
        expect(state.you.scene).toBe('spaceroom');
        // The lobby coordinates must not have leaked into the new room.
        expect(state.you.x === 7 && state.you.z === -4).toBe(false);
        return cleanup(second);
      });
  });

  it('shifts chat-room audio peering from the replaced tab to the takeover tab', () => {
    const peer = connect({ id: 200, displayName: 'Peer' }); // a DIFFERENT account — the other voice in the room
    const x1 = connect({ id: 100, displayName: 'X' }); // the account under test, tab 1
    let x2: ConnectedClient;
    let x1Id: string;

    return Promise.all([waitFor(peer, 'connect'), waitFor(x1, 'connect')])
      .then(() => {
        // The peer joins the scene and the voice room first, alone.
        peer.emit('joinScene', { displayName: 'Peer' }, 'lobby');
        peer.emit('joinChatRoom', 'lobby');
        return sleep(80);
      })
      .then(() => {
        x1Id = x1.id;
        // Tab 1 joins the voice room → the peer is told to open an audio connection to tab 1.
        const peerPairsX1 = waitFor(peer, 'addPeer');
        x1.emit('joinScene', { displayName: 'X' }, 'lobby');
        x1.emit('joinChatRoom', 'lobby');
        return peerPairsX1;
      })
      .then(add1 => {
        expect(add1.peer_id).toBe(x1Id); // peer's voice is wired to tab 1
        // Tab 2 opens for the SAME account → server evicts tab 1, which must tear down its
        // voice link: the peer is told to drop tab 1.
        x2 = connect({ id: 100, displayName: 'X' });
        return waitFor(x2, 'connect').then(() => {
          const peerDropsX1 = waitFor(peer, 'removePeer');
          x2.emit('joinScene', { displayName: 'X' }, 'lobby');
          return peerDropsX1;
        });
      })
      .then(drop => {
        expect(drop.peer_id).toBe(x1Id); // peer tore down audio to tab 1
        // Tab 2 joins the voice room → the peer is re-paired to tab 2.
        const peerPairsX2 = waitFor(peer, 'addPeer');
        x2.emit('joinChatRoom', 'lobby');
        return peerPairsX2;
      })
      .then(add2 => {
        expect(add2.peer_id).toBe(x2.id); // peer's voice now flows to tab 2
        expect(add2.peer_id).not.toBe(x1Id); // and NOT the dead tab 1
        return cleanup(peer, x2);
      });
  });

  it('keeps both sockets when they belong to different accounts', () => {
    const a = connect({ id: 1, displayName: 'A' });
    const b = connect({ id: 2, displayName: 'B' });

    return Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')])
      .then(() => {
        a.emit('joinScene', { displayName: 'A' }, 'lobby');
        b.emit('joinScene', { displayName: 'B' }, 'lobby');
        return sleep(150);
      })
      .then(() => {
        expect(a.connected).toBe(true);
        expect(b.connected).toBe(true);
        return cleanup(a, b);
      });
  });

  it('does not evict anonymous connections (no account id)', () => {
    const a = connect();
    const b = connect();

    return Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')])
      .then(() => {
        a.emit('joinScene', { displayName: 'Anon1' }, 'lobby');
        b.emit('joinScene', { displayName: 'Anon2' }, 'lobby');
        return sleep(150);
      })
      .then(() => {
        expect(a.connected).toBe(true);
        expect(b.connected).toBe(true);
        return cleanup(a, b);
      });
  });

  it('sends removeUser for the replaced ghost socket to a same-room observer', () => {
    const observer = connect({ id: 999, displayName: 'Obs' }); // different account, same room
    const first = connect({ id: 7, displayName: 'Dup' });
    let second: ConnectedClient;
    let firstId: string;

    return Promise.all([waitFor(observer, 'connect'), waitFor(first, 'connect')])
      .then(() => {
        observer.emit('joinScene', { displayName: 'Obs' }, 'lobby');
        first.emit('joinScene', { displayName: 'Dup' }, 'lobby');
        return sleep(120);
      })
      .then(() => {
        firstId = first.id;
        second = connect({ id: 7, displayName: 'Dup' });
        return waitFor(second, 'connect');
      })
      .then(() => {
        const removed = waitFor(observer, 'removeUser');
        second.emit('joinScene', { displayName: 'Dup' }, 'lobby');
        return removed;
      })
      .then(removedId => {
        expect(removedId).toBe(firstId);
        return cleanup(observer, second);
      });
  });

  it('does not trust client-supplied user.id for session replacement (#167)', () => {
    // Two unauthenticated clients both claim id: 1 in the joinScene payload. Before the
    // fix, the second would kick the first via sessionReplaced. After #167, accountId is
    // only taken from the Passport session — without one both stay connected.
    const first = connect();
    let second: ConnectedClient;

    return waitFor(first, 'connect')
      .then(() => {
        first.emit('joinScene', { id: 1, displayName: 'Hacker1' }, 'lobby');
        return sleep(120);
      })
      .then(() => {
        second = connect();
        return waitFor(second, 'connect');
      })
      .then(() => {
        let gotReplaced = false;
        first.once('sessionReplaced', () => {
          gotReplaced = true;
        });
        second.emit('joinScene', { id: 1, displayName: 'Hacker2' }, 'lobby');
        return sleep(200).then(() => {
          expect(gotReplaced).toBe(false);
          expect(first.connected).toBe(true);
          expect(second.connected).toBe(true);
          return cleanup(first, second);
        });
      });
  });
});

// -----------------------------------------------------------------
// 7c. Logout clears handshake identity (issue #199)
// -----------------------------------------------------------------

describe('Socket.io – logout clears handshake identity (#199)', () => {
  it('clears request.user on logout so re-join does not re-bind the prior account', () => {
    // Same Engine.IO socket: join as account 199, logout, re-join without reconnecting.
    // If LOGOUT_USER left socket.request.user intact, re-join would restore accountId 199 and
    // a later same-account join would sessionReplace this socket. After the fix, re-join is
    // anonymous and coexists with a new authenticated session for account 199.
    const first = connect({ id: 199, displayName: 'Alice', skin: 'default' });
    let second: ConnectedClient;

    return waitFor(first, 'connect')
      .then(() => {
        first.emit('joinScene', { displayName: 'Alice', skin: 'default' }, 'lobby');
        return sleep(120);
      })
      .then(() => {
        first.emit('logoutUser');
        return sleep(80);
      })
      .then(() => {
        first.emit('joinScene', { displayName: 'Alice', skin: 'default' }, 'lobby');
        return sleep(120);
      })
      .then(() => {
        second = connect({ id: 199, displayName: 'Alice', skin: 'default' });
        return waitFor(second, 'connect');
      })
      .then(() => {
        let firstReplaced = false;
        first.once('sessionReplaced', () => {
          firstReplaced = true;
        });
        second.emit('joinScene', { displayName: 'Alice', skin: 'default' }, 'lobby');
        return sleep(200).then(() => {
          expect(firstReplaced).toBe(false);
          expect(first.connected).toBe(true);
          expect(second.connected).toBe(true);
          return cleanup(first, second);
        });
      });
  });

  it('logoutUser clears identity even when the socket never joined a scene', () => {
    // Defense-in-depth: LOGOUT_USER must clear request.user even if createdUser is still false,
    // so a later joinScene cannot pick up the handshake Passport user.
    const first = connect({ id: 201, displayName: 'Bob', skin: 'default' });
    let second: ConnectedClient;

    return waitFor(first, 'connect')
      .then(() => {
        first.emit('logoutUser');
        return sleep(80);
      })
      .then(() => {
        first.emit('joinScene', { displayName: 'Bob', skin: 'default' }, 'lobby');
        return sleep(120);
      })
      .then(() => {
        second = connect({ id: 201, displayName: 'Bob', skin: 'default' });
        return waitFor(second, 'connect');
      })
      .then(() => {
        let firstReplaced = false;
        first.once('sessionReplaced', () => {
          firstReplaced = true;
        });
        second.emit('joinScene', { displayName: 'Bob', skin: 'default' }, 'lobby');
        return sleep(200).then(() => {
          expect(firstReplaced).toBe(false);
          expect(first.connected).toBe(true);
          expect(second.connected).toBe(true);
          return cleanup(first, second);
        });
      });
  });
});

// -----------------------------------------------------------------
// 7b. WebRTC signaling room membership (issue #168)
// -----------------------------------------------------------------

describe('Socket.io – WebRTC signaling room membership (#168)', () => {
  it("does not relay iceCandidate to a peer outside the sender's chat room", () => {
    const a = connect();
    const b = connect();

    return Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')])
      .then(() => {
        a.emit('joinScene', { displayName: 'A' }, 'lobby');
        b.emit('joinScene', { displayName: 'B' }, 'lobby');
        return sleep(80);
      })
      .then(() => {
        // Different voice rooms — A must not be able to inject ICE into B.
        a.emit('joinChatRoom', 'voice-a');
        b.emit('joinChatRoom', 'voice-b');
        return sleep(80);
      })
      .then(() => {
        let bGotIce = false;
        b.once('iceCandidate', () => {
          bGotIce = true;
        });
        a.emit('relayICECandidate', {
          peer_id: b.id,
          ice_candidate: { candidate: 'fake', sdpMid: '0', sdpMLineIndex: 0 }
        });
        return sleep(200).then(() => {
          expect(bGotIce).toBe(false);
          return cleanup(a, b);
        });
      });
  });

  it('relays iceCandidate when both peers share the same chat room', () => {
    const a = connect();
    const b = connect();

    return Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')])
      .then(() => {
        a.emit('joinScene', { displayName: 'A' }, 'lobby');
        b.emit('joinScene', { displayName: 'B' }, 'lobby');
        return sleep(80);
      })
      .then(() => {
        a.emit('joinChatRoom', 'voice-shared');
        b.emit('joinChatRoom', 'voice-shared');
        return sleep(80);
      })
      .then(() => {
        const ice = waitFor(b, 'iceCandidate');
        a.emit('relayICECandidate', {
          peer_id: b.id,
          ice_candidate: {
            candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host',
            sdpMid: '0',
            sdpMLineIndex: 0
          }
        });
        return ice;
      })
      .then(payload => {
        // Source peer_id is always the server's view of the sender, never the client-supplied value.
        expect(payload.peer_id).toBe(a.id);
        expect(payload.ice_candidate).toEqual({
          candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0
        });
        return cleanup(a, b);
      });
  });

  it("does not relay sessionDescription to a peer outside the sender's chat room", () => {
    const a = connect();
    const b = connect();

    return Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')])
      .then(() => {
        a.emit('joinScene', { displayName: 'A' }, 'lobby');
        b.emit('joinScene', { displayName: 'B' }, 'lobby');
        return sleep(80);
      })
      .then(() => {
        a.emit('joinChatRoom', 'sdp-a');
        b.emit('joinChatRoom', 'sdp-b');
        return sleep(80);
      })
      .then(() => {
        let bGotSdp = false;
        b.once('sessionDescription', () => {
          bGotSdp = true;
        });
        a.emit('relaySessionDescription', {
          peer_id: b.id,
          session_description: { type: 'offer', sdp: 'v=0' }
        });
        return sleep(200).then(() => {
          expect(bGotSdp).toBe(false);
          return cleanup(a, b);
        });
      });
  });

  it('relays sessionDescription when both peers share the same chat room', () => {
    const a = connect();
    const b = connect();

    return Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')])
      .then(() => {
        a.emit('joinScene', { displayName: 'A' }, 'lobby');
        b.emit('joinScene', { displayName: 'B' }, 'lobby');
        return sleep(80);
      })
      .then(() => {
        a.emit('joinChatRoom', 'sdp-shared');
        b.emit('joinChatRoom', 'sdp-shared');
        return sleep(80);
      })
      .then(() => {
        const sdp = waitFor(b, 'sessionDescription');
        a.emit('relaySessionDescription', {
          peer_id: b.id,
          session_description: { type: 'answer', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1' }
        });
        return sdp;
      })
      .then(payload => {
        expect(payload.peer_id).toBe(a.id);
        expect(payload.session_description).toEqual({
          type: 'answer',
          sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1'
        });
        return cleanup(a, b);
      });
  });
});

// -----------------------------------------------------------------
// 8. Malformed payloads must not crash the server (issue #112)
// -----------------------------------------------------------------

describe('Socket.io – malformed payload safety (issue #112)', () => {
  // Fire a hostile/malformed message from one client, then prove the server process is still
  // alive by completing a fresh, fully valid handshake on a second connection. Before the
  // guarded registration path, each of these threw inside the handler and the uncaught
  // exception took the whole server process down.
  function serverSurvives(fire: (attacker: ConnectedClient) => void) {
    const attacker = connect();
    const probe = connect();
    return Promise.all([waitFor(attacker, 'connect'), waitFor(probe, 'connect')])
      .then(() => {
        fire(attacker);
        return sleep(150);
      })
      .then(() => handshake(probe, 'Probe', 'lobby'))
      .then(state => {
        expect(state.you.id).toBe(probe.id);
        return { state, attacker, probe };
      });
  }

  it('joinScene with a null user is dropped and does not crash the server', () =>
    serverSurvives(c => {
      c.emit('joinScene', null, 'lobby');
    }).then(({ state, attacker, probe }) => {
      // The malformed join must not have created a user either.
      expect(state.others).not.toHaveProperty(attacker.id);
      return cleanup(attacker, probe);
    }));

  it('joinScene with a non-string scene is dropped', () =>
    serverSurvives(c => {
      c.emit('joinScene', { displayName: 'X' }, { evil: true });
    }).then(({ state, attacker, probe }) => {
      expect(state.others).not.toHaveProperty(attacker.id);
      return cleanup(attacker, probe);
    }));

  it('tick with a null payload does not crash the server', () =>
    serverSurvives(c => {
      c.emit('tick', null);
    }).then(({ attacker, probe }) => cleanup(attacker, probe)));

  it('relayICECandidate with a null config does not crash the server', () =>
    serverSurvives(c => {
      c.emit('relayICECandidate', null);
    }).then(({ attacker, probe }) => cleanup(attacker, probe)));

  it('relaySessionDescription with a null config does not crash the server', () =>
    serverSurvives(c => {
      c.emit('relaySessionDescription', null);
    }).then(({ attacker, probe }) => cleanup(attacker, probe)));

  it('joinChatRoom with a non-string room is dropped', () =>
    serverSurvives(c => {
      c.emit('joinChatRoom', { room: 'lobby' });
    }).then(({ attacker, probe }) => cleanup(attacker, probe)));
});

// -----------------------------------------------------------------
// 9. Tick identity & field whitelist (issue #113)
// -----------------------------------------------------------------

describe('Socket.io – tick identity & field whitelist (issue #113)', () => {
  // Identity comes from the transport: a tick naming another socket's id must move the
  // SENDER's avatar, never the named victim's.
  it("a tick carrying another socket's id has no effect on that user", () => {
    const victim = connect();
    const attacker = connect();
    const observer = connect();

    return Promise.all([
      waitFor(victim, 'connect'),
      waitFor(attacker, 'connect'),
      waitFor(observer, 'connect')
    ])
      .then(() => handshake(victim, 'Alice', 'lobby'))
      .then(() => handshake(attacker, 'Mallory', 'lobby'))
      .then(() => {
        // The victim walks to a known spot under its own identity.
        victim.emit('tick', { x: 5, y: 1.3, z: -3, xrot: 0, yrot: 90, zrot: 0 });
        return sleep(80);
      })
      .then(() => {
        // The attacker knows the victim's socket id (it's broadcast in usersUpdated) and
        // tries to teleport them.
        attacker.emit('tick', { id: victim.id, x: 999, y: 999, z: 999, xrot: 0, yrot: 0, zrot: 0 });
        return sleep(80);
      })
      .then(() => handshake(observer, 'Obs', 'lobby'))
      .then(state => {
        expect(state.others[victim.id].x).toBe(5); // unmoved
        expect(state.others[victim.id].z).toBe(-3);
        expect(state.others[attacker.id].x).toBe(999); // the attacker only moved themselves
        return cleanup(victim, attacker, observer);
      });
  });

  it('a tick cannot change displayName, skin, or scene', () => {
    const client = connect();
    const observer = connect();

    return Promise.all([waitFor(client, 'connect'), waitFor(observer, 'connect')])
      .then(() => handshake(client, 'Alice', 'lobby', 'batman'))
      .then(() => {
        client.emit('tick', {
          x: 3,
          y: 1.3,
          z: 0,
          xrot: 0,
          yrot: 0,
          zrot: 0,
          displayName: 'Hacked',
          skin: 'god',
          scene: 'spaceroom'
        });
        return sleep(80);
      })
      .then(() => handshake(observer, 'Obs', 'lobby'))
      .then(state => {
        const seen = state.others[client.id];
        expect(seen.x).toBe(3); // pose merged
        expect(seen.displayName).toBe('Alice'); // identity fields untouched
        expect(seen.skin).toBe('batman');
        expect(seen.scene).toBe('lobby');
        return cleanup(client, observer);
      });
  });

  it('non-finite pose values are dropped', () => {
    const client = connect();
    const observer = connect();

    return Promise.all([waitFor(client, 'connect'), waitFor(observer, 'connect')])
      .then(() => handshake(client, 'Alice', 'lobby'))
      .then(() => {
        client.emit('tick', { x: 5, y: 1.3, z: -3, xrot: 0, yrot: 0, zrot: 0 });
        return sleep(80);
      })
      .then(() => {
        client.emit('tick', { x: 'not-a-number', y: null, yrot: 42 });
        return sleep(80);
      })
      .then(() => handshake(observer, 'Obs', 'lobby'))
      .then(state => {
        const seen = state.others[client.id];
        expect(seen.x).toBe(5); // garbage x/y ignored
        expect(seen.y).toBe(1.3);
        expect(seen.yrot).toBe(42); // the one finite field still merged
        return cleanup(client, observer);
      });
  });

  it('a tick from a socket that never joined a scene is ignored', () => {
    const lurker = connect();
    const observer = connect();

    return Promise.all([waitFor(lurker, 'connect'), waitFor(observer, 'connect')])
      .then(() => {
        lurker.emit('tick', { x: 1, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0 });
        return sleep(80);
      })
      .then(() => handshake(observer, 'Obs', 'lobby'))
      .then(state => {
        expect(state.others).not.toHaveProperty(lurker.id);
        return cleanup(lurker, observer);
      });
  });
});

// -----------------------------------------------------------------
// 10. changeSkin / changeScene — the explicit events that replaced
//     skin/scene riding on ticks (issue #113)
// -----------------------------------------------------------------

describe('Socket.io – changeSkin / changeScene (issue #113)', () => {
  it('changeSkin with a whitelisted skin propagates to peers', () => {
    const client = connect();
    const observer = connect();

    return Promise.all([waitFor(client, 'connect'), waitFor(observer, 'connect')])
      .then(() => handshake(client, 'Alice', 'lobby', '3djesus'))
      .then(() => {
        client.emit('changeSkin', 'batman');
        return sleep(80);
      })
      .then(() => handshake(observer, 'Obs', 'lobby'))
      .then(state => {
        expect(state.others[client.id].skin).toBe('batman');
        return cleanup(client, observer);
      });
  });

  it('changeSkin with a non-whitelisted skin is dropped', () => {
    const client = connect();
    const observer = connect();

    return Promise.all([waitFor(client, 'connect'), waitFor(observer, 'connect')])
      .then(() => handshake(client, 'Alice', 'lobby', '3djesus'))
      .then(() => {
        client.emit('changeSkin', '../../evil; injected: true');
        return sleep(80);
      })
      .then(() => handshake(observer, 'Obs', 'lobby'))
      .then(state => {
        expect(state.others[client.id].skin).toBe('3djesus');
        return cleanup(client, observer);
      });
  });

  it('changeScene moves the sender to the new room (and out of the old one)', () => {
    const mover = connect();
    const obsLobby = connect();
    const obsSpace = connect();

    return Promise.all([
      waitFor(mover, 'connect'),
      waitFor(obsLobby, 'connect'),
      waitFor(obsSpace, 'connect')
    ])
      .then(() => handshake(mover, 'Mover', 'lobby'))
      .then(() => {
        mover.emit('changeScene', 'spaceroom');
        return sleep(80);
      })
      .then(() => handshake(obsLobby, 'ObsL', 'lobby'))
      .then(lobbyState => {
        expect(lobbyState.others).not.toHaveProperty(mover.id);
        return handshake(obsSpace, 'ObsS', 'spaceroom');
      })
      .then(spaceState => {
        expect(spaceState.others).toHaveProperty(mover.id);
        return cleanup(mover, obsLobby, obsSpace);
      });
  });
});
