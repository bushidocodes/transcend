'use strict';

/**
 * Integration tests for the socket.io multiplayer layer.
 *
 * Spins up a real HTTP + socket.io server using the actual server/socket.js handler (including
 * the Redux/Immutable store) and connects multiple socket.io-client instances to simulate users
 * interacting in the VR space.
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
const { expect } = require('chai');

let server, io, PORT;

before(function (done) {
  server = http.createServer();
  io = new SocketIOServer(server, { cors: { origin: '*' } });
  require('./socket')(io);
  server.listen(0, function () {
    PORT = server.address().port;
    done();
  });
});

after(function (done) {
  io.close(done);
});

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
    var timer = setTimeout(function () {
      reject(new Error('Timeout waiting for "' + event + '" (>' + ms + 'ms)'));
    }, ms);
    socket.once(event, function (data) {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function sleep (ms) {
  return new Promise(function (r) { return setTimeout(r, ms); });
}

function cleanup () {
  var clients = Array.prototype.slice.call(arguments);
  clients.forEach(function (c) { if (c && c.connected) c.disconnect(); });
  return sleep(200);
}

// Single-message join: emit joinScene and resolve with the sceneState reply.
function handshake (client, displayName, scene, skin) {
  var ss = waitFor(client, 'sceneState');
  client.emit('joinScene', { displayName: displayName, skin: skin || 'default' }, scene || 'lobby');
  return ss;
}

// -----------------------------------------------------------------
// 1. Join / sceneState
// -----------------------------------------------------------------

describe('Socket.io – joinScene / sceneState', function () {

  it('replies with sceneState (own avatar, empty others, a tick rate) after joinScene', function () {
    var client = connect();
    return waitFor(client, 'connect')
      .then(function () { return handshake(client, 'Alice', 'lobby'); })
      .then(function (state) {
        expect(state).to.include.all.keys('you', 'others', 'tickRate');
        expect(state.you.id).to.equal(client.id);
        expect(state.you.displayName).to.equal('Alice');
        expect(state.you.y).to.equal(1.3);
        expect(state.you).to.include.all.keys('x', 'y', 'z', 'xrot', 'yrot', 'zrot', 'scene');
        expect(state.you.scene).to.equal('lobby');     // joinScene records the room up front
        expect(Object.keys(state.others)).to.have.length(0);
        expect(state.tickRate).to.be.a('number').and.to.be.greaterThan(0);
        return cleanup(client);
      });
  });

  it('initial rotation fields are all zero', function () {
    var client = connect();
    return waitFor(client, 'connect')
      .then(function () { return handshake(client, 'Bob', 'lobby', 'creeper'); })
      .then(function (state) {
        expect(state.you.xrot).to.equal(0);
        expect(state.you.yrot).to.equal(0);
        expect(state.you.zrot).to.equal(0);
        return cleanup(client);
      });
  });
});

// -----------------------------------------------------------------
// 2. sceneState.others (the room's existing users)
// -----------------------------------------------------------------

describe('Socket.io – sceneState.others', function () {

  it('includes another user already in the room and excludes the requester', function () {
    var cA = connect();
    var cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () { return handshake(cB, 'Bob', 'lobby'); })
      .then(function (stateB) {
        expect(stateB.others).to.have.property(cA.id);
        expect(stateB.others).to.not.have.property(cB.id);
        return cleanup(cA, cB);
      });
  });

  it('is empty when no other users are in the room', function () {
    var client = connect();
    return waitFor(client, 'connect')
      .then(function () { return handshake(client, 'Lone Wolf', 'lobby'); })
      .then(function (state) {
        expect(Object.keys(state.others)).to.not.include(client.id);
        expect(Object.keys(state.others)).to.have.length(0);
        return cleanup(client);
      });
  });
});

// -----------------------------------------------------------------
// 3. Real-time position sync (ready -> usersUpdated via store.subscribe)
// -----------------------------------------------------------------

describe('Socket.io – real-time position sync', function () {

  // Connect two clients, join both into the SAME room, subscribe both via `ready`.
  function withTwoSubscribers (body) {
    var cA = connect();
    var cB = connect();

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
      var updatesForB = waitFor(cB, 'usersUpdated');
      cA.emit('tick', { id: cA.id, x: 5, y: 1.3, z: -3, xrot: 0, yrot: 90, zrot: 0, skin: 'default', scene: 'lobby' });
      return updatesForB.then(function (users) {
        expect(users).to.have.property(cA.id);
        expect(users[cA.id].x).to.equal(5);
        expect(users[cA.id].z).to.equal(-3);
        expect(users[cA.id].yrot).to.equal(90);
      });
    });
  });

  it('usersUpdated sent to B does not include B\'s own entry', function () {
    return withTwoSubscribers(function (cA, cB) {
      var updatesForB = waitFor(cB, 'usersUpdated');
      cA.emit('tick', { id: cA.id, x: 1, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
      return updatesForB.then(function (users) {
        expect(users).to.not.have.property(cB.id);
      });
    });
  });

  it('usersUpdated sent to A does not include A\'s own entry', function () {
    return withTwoSubscribers(function (cA, cB) {
      var updatesForA = waitFor(cA, 'usersUpdated');
      cB.emit('tick', { id: cB.id, x: 2, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
      return updatesForA.then(function (users) {
        expect(users).to.not.have.property(cA.id);
        expect(users).to.have.property(cB.id);
      });
    });
  });

  it('all six position/rotation fields are propagated accurately', function () {
    return withTwoSubscribers(function (cA, cB) {
      var updatesForB = waitFor(cB, 'usersUpdated');
      cA.emit('tick', { id: cA.id, x: -7.5, y: 1.8, z: 12.3, xrot: 5, yrot: 270, zrot: -2, skin: 'steve', scene: 'lobby' });
      return updatesForB.then(function (users) {
        var a = users[cA.id];
        expect(a.x).to.equal(-7.5);
        expect(a.y).to.equal(1.8);
        expect(a.z).to.equal(12.3);
        expect(a.xrot).to.equal(5);
        expect(a.yrot).to.equal(270);
        expect(a.zrot).to.equal(-2);
        expect(a.scene).to.equal('lobby');
      });
    });
  });

  it('successive ticks from A update B with the latest position each time', function () {
    return withTwoSubscribers(function (cA, cB) {
      var first = waitFor(cB, 'usersUpdated');
      cA.emit('tick', { id: cA.id, x: 1, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
      return first.then(function (users) {
        expect(users[cA.id].x).to.equal(1);
        var second = waitFor(cB, 'usersUpdated');
        cA.emit('tick', { id: cA.id, x: 99, y: 2.5, z: -50, xrot: 1, yrot: 180, zrot: 0, skin: 'default', scene: 'lobby' });
        return second;
      }).then(function (users) {
        expect(users[cA.id].x).to.equal(99);
        expect(users[cA.id].y).to.equal(2.5);
        expect(users[cA.id].yrot).to.equal(180);
      });
    });
  });
});

// -----------------------------------------------------------------
// 4. Room filtering (issue #58)
// -----------------------------------------------------------------

describe('Socket.io – room filtering (#58)', function () {

  it('sceneState.others excludes a user in a different room', function () {
    var cA = connect();
    var cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cB, 'Bob', 'spaceroom'); })     // B in another room
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function (stateA) {
        expect(stateA.others).to.not.have.property(cB.id);
        return cleanup(cA, cB);
      });
  });

  it('usersUpdated does not deliver a different-room peer\'s tick', function () {
    var cA = connect();
    var cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () { return handshake(cB, 'Bob', 'spaceroom'); })
      .then(function () {
        cA.emit('ready');
        cB.emit('ready');
        return sleep(80);
      })
      .then(function () {
        var updatesForB = waitFor(cB, 'usersUpdated');
        cA.emit('tick', { id: cA.id, x: 1, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
        return updatesForB;
      })
      .then(function (users) {
        expect(users).to.not.have.property(cA.id);   // A is in lobby, B is in spaceroom
        return cleanup(cA, cB);
      });
  });

  it('removeUser is sent only to clients in the departing user\'s room', function () {
    var cLobby1 = connect();
    var cLobby2 = connect();
    var cSpace = connect();

    return Promise.all([waitFor(cLobby1, 'connect'), waitFor(cLobby2, 'connect'), waitFor(cSpace, 'connect')])
      .then(function () { return handshake(cLobby1, 'L1', 'lobby'); })
      .then(function () { return handshake(cLobby2, 'L2', 'lobby'); })
      .then(function () { return handshake(cSpace, 'S', 'spaceroom'); })
      .then(function () {
        var leavingId = cLobby1.id;
        var sameRoomGotIt = waitFor(cLobby2, 'removeUser');
        var spaceGotIt = false;
        cSpace.once('removeUser', function () { spaceGotIt = true; });
        cLobby1.disconnect();
        return sameRoomGotIt.then(function (removedId) {
          expect(removedId).to.equal(leavingId);
          return sleep(120);
        }).then(function () {
          expect(spaceGotIt).to.equal(false);
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
    var client = connect();
    var observer = connect();

    return Promise.all([waitFor(client, 'connect'), waitFor(observer, 'connect')])
      .then(function () { return handshake(client, 'Alice', 'lobby'); })
      .then(function () {
        // A tick arriving under an id that never joined — the post-restart ghost.
        client.emit('tick', {
          id: 'ghost-stale-socket-id',
          x: 1, y: 1.3, z: 2, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby'
        });
        return sleep(100);
      })
      .then(function () {
        // A fresh joiner in the same room would see the ghost in sceneState.others if it had
        // been auto-created. It must not have been.
        return handshake(observer, 'Observer', 'lobby');
      })
      .then(function (state) {
        expect(state.others).to.not.have.property('ghost-stale-socket-id');
        expect(state.others).to.have.property(client.id); // the real user is there
        return cleanup(client, observer);
      });
  });
});

// -----------------------------------------------------------------
// 6. Disconnect / cleanup
// -----------------------------------------------------------------

describe('Socket.io – disconnect cleanup', function () {

  it('removes a disconnected user from subsequent sceneState.others', function () {
    var cA = connect();
    var cB = connect();
    var savedAId;

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () {
        savedAId = cA.id;
        cA.disconnect();
        return sleep(150);
      })
      .then(function () { return handshake(cB, 'Bob', 'lobby'); })
      .then(function (stateB) {
        expect(stateB.others).to.not.have.property(savedAId);
        return cleanup(cB);
      });
  });

  it('sends removeUser to same-room clients on disconnect', function () {
    var cA = connect();
    var cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () { return handshake(cB, 'Bob', 'lobby'); })
      .then(function () {
        var savedAId = cA.id;
        var removePromise = waitFor(cB, 'removeUser');
        cA.disconnect();
        return removePromise.then(function (removedId) {
          expect(removedId).to.equal(savedAId);
          return cleanup(cB);
        });
      });
  });

  it('unsubscribes from the store so a disconnected client no longer fires usersUpdated', function () {
    var cA = connect();
    var cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () { return handshake(cA, 'Alice', 'lobby'); })
      .then(function () { return handshake(cB, 'Bob', 'lobby'); })
      .then(function () {
        cA.emit('ready');
        return sleep(80);
      })
      .then(function () {
        cA.disconnect(); // its store subscription must be torn down
        return sleep(150);
      })
      .then(function () {
        cB.emit('ready');
        return sleep(50);
      })
      .then(function () {
        var updatesForB = waitFor(cB, 'usersUpdated');
        cB.emit('tick', { id: cB.id, x: 0, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
        return updatesForB;
      })
      .then(function () {
        // Reaching here without a server crash means cA's stale subscription wasn't emitting
        // to a closed socket.
        return cleanup(cB);
      });
  });
});

// -----------------------------------------------------------------
// 7. Single active session per account (#30)
// -----------------------------------------------------------------

describe('Socket.io – single active session per account (#30)', function () {

  it('disconnects the prior socket when the same account joins again', function () {
    var first = connect();
    var second;

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
        var firstClosed = waitFor(first, 'disconnect');
        second.emit('joinScene', { id: 42, displayName: 'Dup', skin: 'default' }, 'lobby');
        return firstClosed;
      })
      .then(function () {
        expect(first.connected).to.equal(false);
        expect(second.connected).to.equal(true);
        return cleanup(second);
      });
  });

  it('emits sessionReplaced to the prior socket before disconnecting it', function () {
    var first = connect();
    var second;

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
        var replaced = waitFor(first, 'sessionReplaced');
        second.emit('joinScene', { id: 88, displayName: 'Dup', skin: 'default' }, 'lobby');
        return replaced;
      })
      .then(function () {
        return cleanup(second);
      });
  });

  it('carries the prior session position forward to the takeover tab in the same room', function () {
    var first = connect();
    var second;

    return waitFor(first, 'connect')
      .then(function () {
        var ss = waitFor(first, 'sceneState');
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
        var ss = waitFor(second, 'sceneState');
        second.emit('joinScene', { id: 55, displayName: 'Mover', skin: 'default' }, 'lobby');
        return ss;
      })
      .then(function (state) {
        expect(state.you.x).to.equal(7);
        expect(state.you.z).to.equal(-4);
        expect(state.you.yrot).to.equal(123);
        return cleanup(second);
      });
  });

  it('does NOT carry position across a takeover into a different room', function () {
    var first = connect();
    var second;

    return waitFor(first, 'connect')
      .then(function () {
        var ss = waitFor(first, 'sceneState');
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
        var ss = waitFor(second, 'sceneState');
        second.emit('joinScene', { id: 56, displayName: 'Mover', skin: 'default' }, 'spaceroom');
        return ss;
      })
      .then(function (state) {
        expect(state.you.scene).to.equal('spaceroom');
        // The lobby coordinates must not have leaked into the new room.
        expect(state.you.x === 7 && state.you.z === -4).to.equal(false);
        return cleanup(second);
      });
  });

  it('shifts chat-room audio peering from the replaced tab to the takeover tab', function () {
    var peer = connect();   // a DIFFERENT account — the other voice in the room
    var x1 = connect();     // the account under test, tab 1
    var x2;
    var x1Id;

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
        var peerPairsX1 = waitFor(peer, 'addPeer');
        x1.emit('joinScene', { id: 100, displayName: 'X' }, 'lobby');
        x1.emit('joinChatRoom', 'lobby');
        return peerPairsX1;
      })
      .then(function (add1) {
        expect(add1.peer_id).to.equal(x1Id);          // peer's voice is wired to tab 1
        // Tab 2 opens for the SAME account → server evicts tab 1, which must tear down its
        // voice link: the peer is told to drop tab 1.
        x2 = connect();
        return waitFor(x2, 'connect').then(function () {
          var peerDropsX1 = waitFor(peer, 'removePeer');
          x2.emit('joinScene', { id: 100, displayName: 'X' }, 'lobby');
          return peerDropsX1;
        });
      })
      .then(function (drop) {
        expect(drop.peer_id).to.equal(x1Id);          // peer tore down audio to tab 1
        // Tab 2 joins the voice room → the peer is re-paired to tab 2.
        var peerPairsX2 = waitFor(peer, 'addPeer');
        x2.emit('joinChatRoom', 'lobby');
        return peerPairsX2;
      })
      .then(function (add2) {
        expect(add2.peer_id).to.equal(x2.id);         // peer's voice now flows to tab 2
        expect(add2.peer_id).to.not.equal(x1Id);      // and NOT the dead tab 1
        return cleanup(peer, x2);
      });
  });

  it('keeps both sockets when they belong to different accounts', function () {
    var a = connect();
    var b = connect();

    return Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')])
      .then(function () {
        a.emit('joinScene', { id: 1, displayName: 'A' }, 'lobby');
        b.emit('joinScene', { id: 2, displayName: 'B' }, 'lobby');
        return sleep(150);
      })
      .then(function () {
        expect(a.connected).to.equal(true);
        expect(b.connected).to.equal(true);
        return cleanup(a, b);
      });
  });

  it('does not evict anonymous connections (no account id)', function () {
    var a = connect();
    var b = connect();

    return Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')])
      .then(function () {
        a.emit('joinScene', { displayName: 'Anon1' }, 'lobby');
        b.emit('joinScene', { displayName: 'Anon2' }, 'lobby');
        return sleep(150);
      })
      .then(function () {
        expect(a.connected).to.equal(true);
        expect(b.connected).to.equal(true);
        return cleanup(a, b);
      });
  });

  it('sends removeUser for the replaced ghost socket to a same-room observer', function () {
    var observer = connect(); // different account, same room; stays connected to observe
    var first = connect();
    var second;
    var firstId;

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
        var removed = waitFor(observer, 'removeUser');
        second.emit('joinScene', { id: 7, displayName: 'Dup' }, 'lobby');
        return removed;
      })
      .then(function (removedId) {
        expect(removedId).to.equal(firstId);
        return cleanup(observer, second);
      });
  });
});
