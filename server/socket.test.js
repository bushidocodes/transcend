'use strict';

/**
 * Integration tests for the socket.io multiplayer layer.
 *
 * Spins up a real HTTP + socket.io server using the actual server/socket.js handler (including
 * the GameState container and the fixed-rate broadcast loop) and connects multiple
 * socket.io-client instances to simulate users interacting in the VR space.
 *
 * The Stage-3 handshake was collapsed (issue #69): a client now sends a single `joinScene`
 * (identity + room) and the server replies with one `sceneState` ({ you, others, tickRate });
 * the client then emits `ready` to begin receiving `usersUpdated` pushes. Room filtering (#58)
 * means `sceneState.others` and `usersUpdated` only contain users in the requester's room, and
 * `removeUser` is scoped to the departing user's room.
 */

const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const socketClient = require('socket.io-client');

// describe/it/expect/beforeAll/afterAll are provided as globals by Vitest (test.globals).

let server, io, PORT;

beforeAll(() => new Promise(resolve => {
  server = http.createServer();
  io = new SocketIOServer(server, { cors: { origin: '*' } });
  require('./socket')(io);
  server.listen(0, function () {
    PORT = server.address().port;
    resolve();
  });
}));

afterAll(() => new Promise(resolve => io.close(resolve)));

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function connect () {
  return socketClient('http://localhost:' + PORT, {
    transports: ['websocket'],
    forceNew: true
  });
}

function waitFor (socket, event, ms) {
  ms = ms || 3000;
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error('Timeout waiting for "' + event + '" (>' + ms + 'ms)'));
    }, ms);
    socket.once(event, function (data) {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function sleep (ms) {
  return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}

function cleanup () {
  const clients = Array.prototype.slice.call(arguments);
  clients.forEach(function (c) { if (c && c.connected) c.disconnect(); });
  return sleep(200);
}

// Single-message join: emit joinScene and resolve with the sceneState reply.
function handshake (client, displayName, scene, skin) {
  const ss = waitFor(client, 'sceneState');
  client.emit('joinScene', { displayName, skin: skin || 'default' }, scene || 'lobby');
  return ss;
}

// -----------------------------------------------------------------
// 1. Join / sceneState
// -----------------------------------------------------------------

describe('Socket.io – joinScene / sceneState', function () {
  it('replies with sceneState (own avatar, empty others, a tick rate) after joinScene', function () {
    const client = connect();
    return waitFor(client, 'connect')
      .then(function () { return handshake(client, 'Alice', 'lobby'); })
      .then(function (state) {
        expect(Object.keys(state)).toEqual(expect.arrayContaining(['you', 'others', 'tickRate']));
        expect(state.you.id).toBe(client.id);
        expect(state.you.displayName).toBe('Alice');
        expect(state.you.y).toBe(1.3);
        expect(Object.keys(state.you)).toEqual(expect.arrayContaining(['x', 'y', 'z', 'xrot', 'yrot', 'zrot', 'scene']));
        expect(state.you.scene).toBe('lobby');     // joinScene records the room up front
        expect(Object.keys(state.others)).toHaveLength(0);
        expect(typeof state.tickRate).toBe('number');
        expect(state.tickRate).toBeGreaterThan(0);
        return cleanup(client);
      });
  });

  it('initial rotation fields are all zero', function () {
    const client = connect();
    return waitFor(client, 'connect')
      .then(function () { return handshake(client, 'Bob', 'lobby', 'creeper'); })
      .then(function (state) {
        expect(state.you.xrot).toBe(0);
        expect(state.you.yrot).toBe(0);
        expect(state.you.zrot).toBe(0);
        return cleanup(client);
      });
  });
});

// -----------------------------------------------------------------
// 2. sceneState.others (the room's existing users)
// -----------------------------------------------------------------

describe('Socket.io – sceneState.others', function () {
  it('includes another user already in the room and excludes the requester', function () {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () { return handshake(cB, 'Bob', 'lobby'); })
      .then(function (stateB) {
        expect(stateB.others).toHaveProperty(cA.id);
        expect(stateB.others).not.toHaveProperty(cB.id);
        return cleanup(cA, cB);
      });
  });

  it('is empty when no other users are in the room', function () {
    const client = connect();
    return waitFor(client, 'connect')
      .then(function () { return handshake(client, 'Lone Wolf', 'lobby'); })
      .then(function (state) {
        expect(Object.keys(state.others)).not.toContain(client.id);
        expect(Object.keys(state.others)).toHaveLength(0);
        return cleanup(client);
      });
  });
});

// -----------------------------------------------------------------
// 3. Real-time position sync (ready -> usersUpdated via the fixed-rate broadcast loop, #115)
// -----------------------------------------------------------------

describe('Socket.io – real-time position sync', function () {
  // Connect two clients, join both into the SAME room, subscribe both via `ready`.
  function withTwoSubscribers (body) {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () { return handshake(cB, 'Bob', 'lobby'); })
      .then(function () {
        cA.emit('ready');
        cB.emit('ready');
        return sleep(80); // let both subscriptions register
      })
      .then(function () { return body(cA, cB); })
      .then(function () { return cleanup(cA, cB); });
  }

  it('client B receives usersUpdated when client A emits a tick', function () {
    return withTwoSubscribers(function (cA, cB) {
      const updatesForB = waitFor(cB, 'usersUpdated');
      cA.emit('tick', { id: cA.id, x: 5, y: 1.3, z: -3, xrot: 0, yrot: 90, zrot: 0, skin: 'default', scene: 'lobby' });
      return updatesForB.then(function (users) {
        expect(users).toHaveProperty(cA.id);
        expect(users[cA.id].x).toBe(5);
        expect(users[cA.id].z).toBe(-3);
        expect(users[cA.id].yrot).toBe(90);
      });
    });
  });

  it('usersUpdated sent to B does not include B\'s own entry', function () {
    return withTwoSubscribers(function (cA, cB) {
      const updatesForB = waitFor(cB, 'usersUpdated');
      cA.emit('tick', { id: cA.id, x: 1, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
      return updatesForB.then(function (users) {
        expect(users).not.toHaveProperty(cB.id);
      });
    });
  });

  it('usersUpdated sent to A does not include A\'s own entry', function () {
    return withTwoSubscribers(function (cA, cB) {
      const updatesForA = waitFor(cA, 'usersUpdated');
      cB.emit('tick', { id: cB.id, x: 2, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
      return updatesForA.then(function (users) {
        expect(users).not.toHaveProperty(cA.id);
        expect(users).toHaveProperty(cB.id);
      });
    });
  });

  it('all six position/rotation fields are propagated accurately', function () {
    return withTwoSubscribers(function (cA, cB) {
      const updatesForB = waitFor(cB, 'usersUpdated');
      cA.emit('tick', { id: cA.id, x: -7.5, y: 1.8, z: 12.3, xrot: 5, yrot: 270, zrot: -2, skin: 'steve', scene: 'lobby' });
      return updatesForB.then(function (users) {
        const a = users[cA.id];
        expect(a.x).toBe(-7.5);
        expect(a.y).toBe(1.8);
        expect(a.z).toBe(12.3);
        expect(a.xrot).toBe(5);
        expect(a.yrot).toBe(270);
        expect(a.zrot).toBe(-2);
        expect(a.scene).toBe('lobby');
      });
    });
  });

  it('successive ticks from A update B with the latest position each time', function () {
    return withTwoSubscribers(function (cA, cB) {
      const first = waitFor(cB, 'usersUpdated');
      cA.emit('tick', { id: cA.id, x: 1, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
      return first.then(function (users) {
        expect(users[cA.id].x).toBe(1);
        const second = waitFor(cB, 'usersUpdated');
        cA.emit('tick', { id: cA.id, x: 99, y: 2.5, z: -50, xrot: 1, yrot: 180, zrot: 0, skin: 'default', scene: 'lobby' });
        return second;
      }).then(function (users) {
        expect(users[cA.id].x).toBe(99);
        expect(users[cA.id].y).toBe(2.5);
        expect(users[cA.id].yrot).toBe(180);
      });
    });
  });
});

// -----------------------------------------------------------------
// 4. Room filtering (issue #58)
// -----------------------------------------------------------------

describe('Socket.io – room filtering (#58)', function () {
  it('sceneState.others excludes a user in a different room', function () {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cB, 'Bob', 'spaceroom'); })     // B in another room
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function (stateA) {
        expect(stateA.others).not.toHaveProperty(cB.id);
        return cleanup(cA, cB);
      });
  });

  it('usersUpdated does not deliver a different-room peer\'s tick', function () {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () { return handshake(cB, 'Bob', 'spaceroom'); })
      .then(function () {
        cA.emit('ready');
        cB.emit('ready');
        return sleep(80);
      })
      .then(function () {
        // Broadcasts are room-scoped and only fire for rooms whose state changed (#115), so B
        // may legitimately receive NOTHING here. Collect whatever does arrive and assert A's
        // tick never crossed the room boundary.
        const receivedByB = [];
        cB.on('usersUpdated', function (users) { receivedByB.push(users); });
        cA.emit('tick', { id: cA.id, x: 1, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
        return sleep(250).then(function () { return receivedByB; });
      })
      .then(function (receivedByB) {
        receivedByB.forEach(function (users) {
          expect(users).not.toHaveProperty(cA.id);   // A is in lobby, B is in spaceroom
        });
        return cleanup(cA, cB);
      });
  });

  it('removeUser is sent only to clients in the departing user\'s room', function () {
    const cLobby1 = connect();
    const cLobby2 = connect();
    const cSpace = connect();

    return Promise.all([waitFor(cLobby1, 'connect'), waitFor(cLobby2, 'connect'), waitFor(cSpace, 'connect')])
      .then(function () { return handshake(cLobby1, 'L1', 'lobby'); })
      .then(function () { return handshake(cLobby2, 'L2', 'lobby'); })
      .then(function () { return handshake(cSpace, 'S', 'spaceroom'); })
      .then(function () {
        const leavingId = cLobby1.id;
        const sameRoomGotIt = waitFor(cLobby2, 'removeUser');
        let spaceGotIt = false;
        cSpace.once('removeUser', function () { spaceGotIt = true; });
        cLobby1.disconnect();
        return sameRoomGotIt.then(function (removedId) {
          expect(removedId).toBe(leavingId);
          return sleep(120);
        }).then(function () {
          expect(spaceGotIt).toBe(false);
          return cleanup(cLobby2, cSpace);
        });
      });
  });
});

// -----------------------------------------------------------------
// 5. Tick guard — a position tick must never CREATE a user (issue #56)
// -----------------------------------------------------------------

describe('Socket.io – tick guard (issue #56)', function () {
  it('a tick for an unregistered socket id does not create a ghost user', function () {
    const client = connect();
    const observer = connect();

    return Promise.all([waitFor(client, 'connect'), waitFor(observer, 'connect')])
      .then(function () { return handshake(client, 'Alice', 'lobby'); })
      .then(function () {
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
      .then(function () {
        // A fresh joiner in the same room would see the ghost in sceneState.others if it had
        // been auto-created. It must not have been.
        return handshake(observer, 'Observer', 'lobby');
      })
      .then(function (state) {
        expect(state.others).not.toHaveProperty('ghost-stale-socket-id');
        expect(state.others).toHaveProperty(client.id); // the real user is there
        return cleanup(client, observer);
      });
  });
});

// -----------------------------------------------------------------
// 6. Disconnect / cleanup
// -----------------------------------------------------------------

describe('Socket.io – disconnect cleanup', function () {
  it('removes a disconnected user from subsequent sceneState.others', function () {
    const cA = connect();
    const cB = connect();
    let savedAId;

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () {
        savedAId = cA.id;
        cA.disconnect();
        return sleep(150);
      })
      .then(function () { return handshake(cB, 'Bob', 'lobby'); })
      .then(function (stateB) {
        expect(stateB.others).not.toHaveProperty(savedAId);
        return cleanup(cB);
      });
  });

  it('sends removeUser to same-room clients on disconnect', function () {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () { return handshake(cB, 'Bob', 'lobby'); })
      .then(function () {
        const savedAId = cA.id;
        const removePromise = waitFor(cB, 'removeUser');
        cA.disconnect();
        return removePromise.then(function (removedId) {
          expect(removedId).toBe(savedAId);
          return cleanup(cB);
        });
      });
  });

  it('keeps broadcasting to the survivors after a subscribed client disconnects', function () {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () { return handshake(cB, 'Bob', 'lobby'); })
      .then(function () {
        cA.emit('ready');
        return sleep(80);
      })
      .then(function () {
        cA.disconnect(); // socket.io drops it from the scene broadcast room
        return sleep(150);
      })
      .then(function () {
        cB.emit('ready');
        return sleep(50);
      })
      .then(function () {
        const updatesForB = waitFor(cB, 'usersUpdated');
        cB.emit('tick', { id: cB.id, x: 0, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
        return updatesForB;
      })
      .then(function () {
        // Reaching here without a server crash means the broadcast loop handled the departed
        // socket cleanly and kept streaming to the survivor.
        return cleanup(cB);
      });
  });
});

// -----------------------------------------------------------------
// 6b. Fixed-rate broadcast loop (issue #115)
// -----------------------------------------------------------------

describe('Socket.io – fixed-rate broadcast loop (issue #115)', function () {
  it('a quiet room receives no usersUpdated traffic', function () {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () { return handshake(cB, 'Bob', 'lobby'); })
      .then(function () {
        cA.emit('ready');
        cB.emit('ready');
        // Let the join-triggered snapshots flush before we start counting.
        return sleep(200);
      })
      .then(function () {
        const received = [];
        cB.on('usersUpdated', function (users) { received.push(users); });
        return sleep(300).then(function () { return received; });
      })
      .then(function (received) {
        // Nobody ticked, so the room never went dirty and the loop stayed silent — the old
        // per-dispatch subscription fan-out is gone.
        expect(received).toHaveLength(0);
        return cleanup(cA, cB);
      });
  });

  it('a burst of ticks inside one broadcast interval coalesces into fewer snapshots', function () {
    const cA = connect();
    const cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () { return handshake(cB, 'Bob', 'lobby'); })
      .then(function () {
        cA.emit('ready');
        cB.emit('ready');
        return sleep(200); // flush join-triggered snapshots
      })
      .then(function () {
        const received = [];
        cB.on('usersUpdated', function (users) { received.push(users); });
        // 20 back-to-back ticks. Under the old per-dispatch fan-out B would get ~20
        // usersUpdated; under a 50ms broadcast clock they collapse into a handful of beats.
        for (let i = 1; i <= 20; i++) {
          cA.emit('tick', { x: i, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0 });
        }
        return sleep(400).then(function () { return received; });
      })
      .then(function (received) {
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

describe('Socket.io – single active session per account (#30)', function () {
  it('disconnects the prior socket when the same account joins again', function () {
    const first = connect();
    let second;

    return waitFor(first, 'connect')
      .then(function () {
        first.emit('joinScene', { id: 42, displayName: 'Dup', skin: 'default' }, 'lobby');
        return sleep(120);
      })
      .then(function () {
        second = connect();
        return waitFor(second, 'connect');
      })
      .then(function () {
        const firstClosed = waitFor(first, 'disconnect');
        second.emit('joinScene', { id: 42, displayName: 'Dup', skin: 'default' }, 'lobby');
        return firstClosed;
      })
      .then(function () {
        expect(first.connected).toBe(false);
        expect(second.connected).toBe(true);
        return cleanup(second);
      });
  });

  it('emits sessionReplaced to the prior socket before disconnecting it', function () {
    const first = connect();
    let second;

    return waitFor(first, 'connect')
      .then(function () {
        first.emit('joinScene', { id: 88, displayName: 'Dup', skin: 'default' }, 'lobby');
        return sleep(120);
      })
      .then(function () {
        second = connect();
        return waitFor(second, 'connect');
      })
      .then(function () {
        // The replaced client must hear sessionReplaced — that's the signal the browser
        // uses to stop being a live (locally-movable) zombie session and block its tab.
        const replaced = waitFor(first, 'sessionReplaced');
        second.emit('joinScene', { id: 88, displayName: 'Dup', skin: 'default' }, 'lobby');
        return replaced;
      })
      .then(function () {
        return cleanup(second);
      });
  });

  it('carries the prior session position forward to the takeover tab in the same room', function () {
    const first = connect();
    let second;

    return waitFor(first, 'connect')
      .then(function () {
        const ss = waitFor(first, 'sceneState');
        first.emit('joinScene', { id: 55, displayName: 'Mover', skin: 'default' }, 'lobby');
        return ss;
      })
      .then(function () {
        // Walk the first session to a known spot.
        first.emit('tick', { id: first.id, x: 7, y: 1.3, z: -4, xrot: 0, yrot: 123, zrot: 0, skin: 'default', scene: 'lobby' });
        return sleep(80);
      })
      .then(function () {
        second = connect();
        return waitFor(second, 'connect');
      })
      .then(function () {
        const ss = waitFor(second, 'sceneState');
        second.emit('joinScene', { id: 55, displayName: 'Mover', skin: 'default' }, 'lobby');
        return ss;
      })
      .then(function (state) {
        expect(state.you.x).toBe(7);
        expect(state.you.z).toBe(-4);
        expect(state.you.yrot).toBe(123);
        return cleanup(second);
      });
  });

  it('does NOT carry position across a takeover into a different room', function () {
    const first = connect();
    let second;

    return waitFor(first, 'connect')
      .then(function () {
        const ss = waitFor(first, 'sceneState');
        first.emit('joinScene', { id: 56, displayName: 'Mover', skin: 'default' }, 'lobby');
        return ss;
      })
      .then(function () {
        first.emit('tick', { id: first.id, x: 7, y: 1.3, z: -4, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
        return sleep(80);
      })
      .then(function () {
        second = connect();
        return waitFor(second, 'connect');
      })
      .then(function () {
        const ss = waitFor(second, 'sceneState');
        second.emit('joinScene', { id: 56, displayName: 'Mover', skin: 'default' }, 'spaceroom');
        return ss;
      })
      .then(function (state) {
        expect(state.you.scene).toBe('spaceroom');
        // The lobby coordinates must not have leaked into the new room.
        expect(state.you.x === 7 && state.you.z === -4).toBe(false);
        return cleanup(second);
      });
  });

  it('shifts chat-room audio peering from the replaced tab to the takeover tab', function () {
    const peer = connect();   // a DIFFERENT account — the other voice in the room
    const x1 = connect();     // the account under test, tab 1
    let x2;
    let x1Id;

    return Promise.all([waitFor(peer, 'connect'), waitFor(x1, 'connect')])
      .then(function () {
        // The peer joins the scene and the voice room first, alone.
        peer.emit('joinScene', { id: 200, displayName: 'Peer' }, 'lobby');
        peer.emit('joinChatRoom', 'lobby');
        return sleep(80);
      })
      .then(function () {
        x1Id = x1.id;
        // Tab 1 joins the voice room → the peer is told to open an audio connection to tab 1.
        const peerPairsX1 = waitFor(peer, 'addPeer');
        x1.emit('joinScene', { id: 100, displayName: 'X' }, 'lobby');
        x1.emit('joinChatRoom', 'lobby');
        return peerPairsX1;
      })
      .then(function (add1) {
        expect(add1.peer_id).toBe(x1Id);          // peer's voice is wired to tab 1
        // Tab 2 opens for the SAME account → server evicts tab 1, which must tear down its
        // voice link: the peer is told to drop tab 1.
        x2 = connect();
        return waitFor(x2, 'connect').then(function () {
          const peerDropsX1 = waitFor(peer, 'removePeer');
          x2.emit('joinScene', { id: 100, displayName: 'X' }, 'lobby');
          return peerDropsX1;
        });
      })
      .then(function (drop) {
        expect(drop.peer_id).toBe(x1Id);          // peer tore down audio to tab 1
        // Tab 2 joins the voice room → the peer is re-paired to tab 2.
        const peerPairsX2 = waitFor(peer, 'addPeer');
        x2.emit('joinChatRoom', 'lobby');
        return peerPairsX2;
      })
      .then(function (add2) {
        expect(add2.peer_id).toBe(x2.id);         // peer's voice now flows to tab 2
        expect(add2.peer_id).not.toBe(x1Id);      // and NOT the dead tab 1
        return cleanup(peer, x2);
      });
  });

  it('keeps both sockets when they belong to different accounts', function () {
    const a = connect();
    const b = connect();

    return Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')])
      .then(function () {
        a.emit('joinScene', { id: 1, displayName: 'A' }, 'lobby');
        b.emit('joinScene', { id: 2, displayName: 'B' }, 'lobby');
        return sleep(150);
      })
      .then(function () {
        expect(a.connected).toBe(true);
        expect(b.connected).toBe(true);
        return cleanup(a, b);
      });
  });

  it('does not evict anonymous connections (no account id)', function () {
    const a = connect();
    const b = connect();

    return Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')])
      .then(function () {
        a.emit('joinScene', { displayName: 'Anon1' }, 'lobby');
        b.emit('joinScene', { displayName: 'Anon2' }, 'lobby');
        return sleep(150);
      })
      .then(function () {
        expect(a.connected).toBe(true);
        expect(b.connected).toBe(true);
        return cleanup(a, b);
      });
  });

  it('sends removeUser for the replaced ghost socket to a same-room observer', function () {
    const observer = connect(); // different account, same room; stays connected to observe
    const first = connect();
    let second;
    let firstId;

    return Promise.all([waitFor(observer, 'connect'), waitFor(first, 'connect')])
      .then(function () {
        observer.emit('joinScene', { id: 999, displayName: 'Obs' }, 'lobby');
        first.emit('joinScene', { id: 7, displayName: 'Dup' }, 'lobby');
        return sleep(120);
      })
      .then(function () {
        firstId = first.id;
        second = connect();
        return waitFor(second, 'connect');
      })
      .then(function () {
        const removed = waitFor(observer, 'removeUser');
        second.emit('joinScene', { id: 7, displayName: 'Dup' }, 'lobby');
        return removed;
      })
      .then(function (removedId) {
        expect(removedId).toBe(firstId);
        return cleanup(observer, second);
      });
  });
});

// -----------------------------------------------------------------
// 8. Malformed payloads must not crash the server (issue #112)
// -----------------------------------------------------------------

describe('Socket.io – malformed payload safety (issue #112)', function () {
  // Fire a hostile/malformed message from one client, then prove the server process is still
  // alive by completing a fresh, fully valid handshake on a second connection. Before the
  // guarded registration path, each of these threw inside the handler and the uncaught
  // exception took the whole server process down.
  function serverSurvives (fire) {
    const attacker = connect();
    const probe = connect();
    return Promise.all([waitFor(attacker, 'connect'), waitFor(probe, 'connect')])
      .then(function () {
        fire(attacker);
        return sleep(150);
      })
      .then(function () { return handshake(probe, 'Probe', 'lobby'); })
      .then(function (state) {
        expect(state.you.id).toBe(probe.id);
        return { state, attacker, probe };
      });
  }

  it('joinScene with a null user is dropped and does not crash the server', function () {
    return serverSurvives(function (c) { c.emit('joinScene', null, 'lobby'); })
      .then(function ({ state, attacker, probe }) {
        // The malformed join must not have created a user either.
        expect(state.others).not.toHaveProperty(attacker.id);
        return cleanup(attacker, probe);
      });
  });

  it('joinScene with a non-string scene is dropped', function () {
    return serverSurvives(function (c) { c.emit('joinScene', { displayName: 'X' }, { evil: true }); })
      .then(function ({ state, attacker, probe }) {
        expect(state.others).not.toHaveProperty(attacker.id);
        return cleanup(attacker, probe);
      });
  });

  it('tick with a null payload does not crash the server', function () {
    return serverSurvives(function (c) { c.emit('tick', null); })
      .then(function ({ attacker, probe }) { return cleanup(attacker, probe); });
  });

  it('relayICECandidate with a null config does not crash the server', function () {
    return serverSurvives(function (c) { c.emit('relayICECandidate', null); })
      .then(function ({ attacker, probe }) { return cleanup(attacker, probe); });
  });

  it('relaySessionDescription with a null config does not crash the server', function () {
    return serverSurvives(function (c) { c.emit('relaySessionDescription', null); })
      .then(function ({ attacker, probe }) { return cleanup(attacker, probe); });
  });

  it('joinChatRoom with a non-string room is dropped', function () {
    return serverSurvives(function (c) { c.emit('joinChatRoom', { room: 'lobby' }); })
      .then(function ({ attacker, probe }) { return cleanup(attacker, probe); });
  });
});

// -----------------------------------------------------------------
// 9. Tick identity & field whitelist (issue #113)
// -----------------------------------------------------------------

describe('Socket.io – tick identity & field whitelist (issue #113)', function () {
  // Identity comes from the transport: a tick naming another socket's id must move the
  // SENDER's avatar, never the named victim's.
  it('a tick carrying another socket\'s id has no effect on that user', function () {
    const victim = connect();
    const attacker = connect();
    const observer = connect();

    return Promise.all([waitFor(victim, 'connect'), waitFor(attacker, 'connect'), waitFor(observer, 'connect')])
      .then(function () { return handshake(victim, 'Alice', 'lobby'); })
      .then(function () { return handshake(attacker, 'Mallory', 'lobby'); })
      .then(function () {
        // The victim walks to a known spot under its own identity.
        victim.emit('tick', { x: 5, y: 1.3, z: -3, xrot: 0, yrot: 90, zrot: 0 });
        return sleep(80);
      })
      .then(function () {
        // The attacker knows the victim's socket id (it's broadcast in usersUpdated) and
        // tries to teleport them.
        attacker.emit('tick', { id: victim.id, x: 999, y: 999, z: 999, xrot: 0, yrot: 0, zrot: 0 });
        return sleep(80);
      })
      .then(function () { return handshake(observer, 'Obs', 'lobby'); })
      .then(function (state) {
        expect(state.others[victim.id].x).toBe(5);      // unmoved
        expect(state.others[victim.id].z).toBe(-3);
        expect(state.others[attacker.id].x).toBe(999);  // the attacker only moved themselves
        return cleanup(victim, attacker, observer);
      });
  });

  it('a tick cannot change displayName, skin, or scene', function () {
    const client = connect();
    const observer = connect();

    return Promise.all([waitFor(client, 'connect'), waitFor(observer, 'connect')])
      .then(function () { return handshake(client, 'Alice', 'lobby', 'batman'); })
      .then(function () {
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
      .then(function () { return handshake(observer, 'Obs', 'lobby'); })
      .then(function (state) {
        const seen = state.others[client.id];
        expect(seen.x).toBe(3);                    // pose merged
        expect(seen.displayName).toBe('Alice');    // identity fields untouched
        expect(seen.skin).toBe('batman');
        expect(seen.scene).toBe('lobby');
        return cleanup(client, observer);
      });
  });

  it('non-finite pose values are dropped', function () {
    const client = connect();
    const observer = connect();

    return Promise.all([waitFor(client, 'connect'), waitFor(observer, 'connect')])
      .then(function () { return handshake(client, 'Alice', 'lobby'); })
      .then(function () {
        client.emit('tick', { x: 5, y: 1.3, z: -3, xrot: 0, yrot: 0, zrot: 0 });
        return sleep(80);
      })
      .then(function () {
        client.emit('tick', { x: 'not-a-number', y: null, yrot: 42 });
        return sleep(80);
      })
      .then(function () { return handshake(observer, 'Obs', 'lobby'); })
      .then(function (state) {
        const seen = state.others[client.id];
        expect(seen.x).toBe(5);      // garbage x/y ignored
        expect(seen.y).toBe(1.3);
        expect(seen.yrot).toBe(42);  // the one finite field still merged
        return cleanup(client, observer);
      });
  });

  it('a tick from a socket that never joined a scene is ignored', function () {
    const lurker = connect();
    const observer = connect();

    return Promise.all([waitFor(lurker, 'connect'), waitFor(observer, 'connect')])
      .then(function () {
        lurker.emit('tick', { x: 1, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0 });
        return sleep(80);
      })
      .then(function () { return handshake(observer, 'Obs', 'lobby'); })
      .then(function (state) {
        expect(state.others).not.toHaveProperty(lurker.id);
        return cleanup(lurker, observer);
      });
  });
});

// -----------------------------------------------------------------
// 10. changeSkin / changeScene — the explicit events that replaced
//     skin/scene riding on ticks (issue #113)
// -----------------------------------------------------------------

describe('Socket.io – changeSkin / changeScene (issue #113)', function () {
  it('changeSkin with a whitelisted skin propagates to peers', function () {
    const client = connect();
    const observer = connect();

    return Promise.all([waitFor(client, 'connect'), waitFor(observer, 'connect')])
      .then(function () { return handshake(client, 'Alice', 'lobby', '3djesus'); })
      .then(function () {
        client.emit('changeSkin', 'batman');
        return sleep(80);
      })
      .then(function () { return handshake(observer, 'Obs', 'lobby'); })
      .then(function (state) {
        expect(state.others[client.id].skin).toBe('batman');
        return cleanup(client, observer);
      });
  });

  it('changeSkin with a non-whitelisted skin is dropped', function () {
    const client = connect();
    const observer = connect();

    return Promise.all([waitFor(client, 'connect'), waitFor(observer, 'connect')])
      .then(function () { return handshake(client, 'Alice', 'lobby', '3djesus'); })
      .then(function () {
        client.emit('changeSkin', '../../evil; injected: true');
        return sleep(80);
      })
      .then(function () { return handshake(observer, 'Obs', 'lobby'); })
      .then(function (state) {
        expect(state.others[client.id].skin).toBe('3djesus');
        return cleanup(client, observer);
      });
  });

  it('changeScene moves the sender to the new room (and out of the old one)', function () {
    const mover = connect();
    const obsLobby = connect();
    const obsSpace = connect();

    return Promise.all([waitFor(mover, 'connect'), waitFor(obsLobby, 'connect'), waitFor(obsSpace, 'connect')])
      .then(function () { return handshake(mover, 'Mover', 'lobby'); })
      .then(function () {
        mover.emit('changeScene', 'spaceroom');
        return sleep(80);
      })
      .then(function () { return handshake(obsLobby, 'ObsL', 'lobby'); })
      .then(function (lobbyState) {
        expect(lobbyState.others).not.toHaveProperty(mover.id);
        return handshake(obsSpace, 'ObsS', 'spaceroom');
      })
      .then(function (spaceState) {
        expect(spaceState.others).toHaveProperty(mover.id);
        return cleanup(mover, obsLobby, obsSpace);
      });
  });
});
