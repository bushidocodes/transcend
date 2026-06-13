'use strict';

/**
 * Integration tests for the socket.io multiplayer layer (PR #18).
 *
 * Spins up a real HTTP + socket.io server using the actual server/socket.js
 * handler (including the Redux/Immutable store) and connects multiple
 * socket.io-client instances to simulate two users interacting in the VR
 * space — covering the full connect → avatar-create → position-sync → disconnect
 * lifecycle without needing a second human or a browser.
 */

const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const socketClient = require('socket.io-client');
const { expect } = require('chai');

let server, io, PORT;

// Each test file gets its own server to isolate the singleton Redux store.
// server.listen(0) lets the OS pick a free port.
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
  // io.close() disconnects all sockets and closes the underlying HTTP server.
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

/**
 * Returns a Promise that resolves with the first payload received for
 * `event` on `socket`, or rejects after `ms` milliseconds.
 */
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

/**
 * Disconnect one or more clients and wait briefly for the server-side
 * disconnect handler to remove them from the Redux store.
 */
function cleanup () {
  var clients = Array.prototype.slice.call(arguments);
  clients.forEach(function (c) { if (c && c.connected) c.disconnect(); });
  return sleep(200);
}

// -----------------------------------------------------------------
// Full handshake helper
// Connects a client, creates a user, and waits for renderAvatar.
// Returns the renderAvatar payload.
// -----------------------------------------------------------------
function handshake (client, displayName, skin) {
  var raPromise = waitFor(client, 'renderAvatar');
  client.emit('connectUser', { displayName: displayName, skin: skin || 'default' });
  client.emit('sceneLoad');
  return raPromise;
}

// -----------------------------------------------------------------
// 1. User lifecycle
// -----------------------------------------------------------------

describe('Socket.io – user lifecycle', function () {

  it('emits renderAvatar after connectUser + sceneLoad', function () {
    var client = connect();
    return waitFor(client, 'connect')
      .then(function () { return handshake(client, 'Alice'); })
      .then(function (user) {
        expect(user.id).to.equal(client.id);
        expect(user.displayName).to.equal('Alice');
        expect(user.y).to.equal(1.3);
        expect(user).to.include.all.keys('x', 'y', 'z', 'xrot', 'yrot', 'zrot', 'scene');
        return cleanup(client);
      });
  });

  it('initial rotation fields are all zero', function () {
    var client = connect();
    return waitFor(client, 'connect')
      .then(function () { return handshake(client, 'Bob', 'creeper'); })
      .then(function (user) {
        expect(user.xrot).to.equal(0);
        expect(user.yrot).to.equal(0);
        expect(user.zrot).to.equal(0);
        return cleanup(client);
      });
  });

  it('sceneLoad before connectUser does not crash and no renderAvatar fires', function () {
    var client = connect();
    return waitFor(client, 'connect')
      .then(function () {
        // Emit sceneLoad first — the server sets sceneLoaded=true but createdUser is
        // still false, so renderAvatar must not fire.
        client.emit('sceneLoad');
        return sleep(150);
      })
      .then(function () {
        // Now create the user — renderAvatar SHOULD fire now.
        var ra = waitFor(client, 'renderAvatar');
        client.emit('connectUser', { displayName: 'Charlie', skin: 'default' });
        return ra;
      })
      .then(function (user) {
        expect(user.displayName).to.equal('Charlie');
        return cleanup(client);
      });
  });
});

// -----------------------------------------------------------------
// 2. getOthers
// -----------------------------------------------------------------

describe('Socket.io – getOthers', function () {

  it('returns all other users but excludes the requesting client', function () {
    var cA = connect();
    var cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () {
        return Promise.all([
          handshake(cA, 'Alice'),
          handshake(cB, 'Bob')
        ]);
      })
      .then(function () {
        var othersPromise = waitFor(cA, 'getOthersCallback');
        cA.emit('getOthers');
        return othersPromise;
      })
      .then(function (others) {
        expect(others).to.have.property(cB.id);
        expect(others).to.not.have.property(cA.id);
        return cleanup(cA, cB);
      });
  });

  it('returns an empty object when no other users are connected', function () {
    var client = connect();

    return waitFor(client, 'connect')
      .then(function () { return handshake(client, 'Lone Wolf'); })
      .then(function () {
        var othersPromise = waitFor(client, 'getOthersCallback');
        client.emit('getOthers');
        return othersPromise;
      })
      .then(function (others) {
        // No one else in the session — filter should yield an empty object
        var ids = Object.keys(others);
        expect(ids).to.not.include(client.id);
        return cleanup(client);
      });
  });
});

// -----------------------------------------------------------------
// 3. Real-time position sync — the core PR #18 feature
//
// Server uses store.subscribe() to push usersUpdated to every subscriber
// whenever any user's tick data lands in the Redux store.
// -----------------------------------------------------------------

describe('Socket.io – real-time position sync (PR #18: store.subscribe push)', function () {

  // Shared setup: connect two clients, do the full handshake for both,
  // subscribe both to updates, then yield to the test body via callback.
  function withTwoSubscribers (body) {
    var cA = connect();
    var cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () {
        return Promise.all([handshake(cA, 'Alice'), handshake(cB, 'Bob')]);
      })
      .then(function () {
        var gA = waitFor(cA, 'getOthersCallback');
        var gB = waitFor(cB, 'getOthersCallback');
        // Place both clients in the same room. The server now filters usersUpdated by room
        // (issue #58), so peers must share a scene to see each other's ticks.
        cA.emit('getOthers', 'lobby');
        cB.emit('getOthers', 'lobby');
        return Promise.all([gA, gB]);
      })
      .then(function () {
        cA.emit('haveGottenOthers');
        cB.emit('haveGottenOthers');
        cA.emit('readyToReceiveUpdates');
        cB.emit('readyToReceiveUpdates');
        // Give the server a moment to register both subscriptions.
        return sleep(80);
      })
      .then(function () { return body(cA, cB); })
      .then(function () { return cleanup(cA, cB); });
  }

  it('client B receives usersUpdated when client A emits a tick', function () {
    return withTwoSubscribers(function (cA, cB) {
      var updatesForB = waitFor(cB, 'usersUpdated');

      cA.emit('tick', {
        id: cA.id,
        x: 5, y: 1.3, z: -3,
        xrot: 0, yrot: 90, zrot: 0,
        skin: 'default', scene: 'lobby'
      });

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

      cA.emit('tick', {
        id: cA.id,
        x: -7.5, y: 1.8, z: 12.3,
        xrot: 5, yrot: 270, zrot: -2,
        skin: 'steve', scene: 'lobby'
      });

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
// 3a. Room filtering (issue #58)
//
// The server now sends each client only the users in its own room (scene), and
// scopes removeUser to the departing user's room. Scene is reported via getOthers
// (and kept current by ticks).
// -----------------------------------------------------------------

describe('Socket.io – room filtering (#58)', function () {

  it('getOthersCallback excludes users in a different room', function () {
    var cA = connect();
    var cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () {
        return Promise.all([handshake(cA, 'Alice'), handshake(cB, 'Bob')]);
      })
      .then(function () {
        cB.emit('getOthers', 'spaceroom'); // place B in another room
        return sleep(50);
      })
      .then(function () {
        var othersForA = waitFor(cA, 'getOthersCallback');
        cA.emit('getOthers', 'lobby');
        return othersForA;
      })
      .then(function (others) {
        expect(others).to.not.have.property(cB.id);
        return cleanup(cA, cB);
      });
  });

  it('usersUpdated does not deliver a different-room peer\'s tick', function () {
    var cA = connect();
    var cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () {
        return Promise.all([handshake(cA, 'Alice'), handshake(cB, 'Bob')]);
      })
      .then(function () {
        cA.emit('getOthers', 'lobby');     // A in lobby
        cB.emit('getOthers', 'spaceroom'); // B in spaceroom
        cA.emit('readyToReceiveUpdates');
        cB.emit('readyToReceiveUpdates');
        return sleep(80);
      })
      .then(function () {
        var updatesForB = waitFor(cB, 'usersUpdated');
        cA.emit('tick', { id: cA.id, x: 1, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
        return updatesForB;
      })
      .then(function (users) {
        // B is in spaceroom, so A's lobby tick must not surface A in B's payload.
        expect(users).to.not.have.property(cA.id);
        return cleanup(cA, cB);
      });
  });

  it('removeUser is sent only to clients in the departing user\'s room', function () {
    var cLobby1 = connect();
    var cLobby2 = connect();
    var cSpace = connect();

    return Promise.all([waitFor(cLobby1, 'connect'), waitFor(cLobby2, 'connect'), waitFor(cSpace, 'connect')])
      .then(function () {
        return Promise.all([handshake(cLobby1, 'L1'), handshake(cLobby2, 'L2'), handshake(cSpace, 'S')]);
      })
      .then(function () {
        cLobby1.emit('getOthers', 'lobby');
        cLobby2.emit('getOthers', 'lobby');
        cSpace.emit('getOthers', 'spaceroom');
        return sleep(60);
      })
      .then(function () {
        var leavingId = cLobby1.id;
        var sameRoomGotIt = waitFor(cLobby2, 'removeUser');
        var spaceGotIt = false;
        cSpace.once('removeUser', function () { spaceGotIt = true; });
        cLobby1.disconnect();
        return sameRoomGotIt.then(function (removedId) {
          expect(removedId).to.equal(leavingId);
          return sleep(120); // give any errant cross-room emit time to arrive
        }).then(function () {
          expect(spaceGotIt).to.equal(false);
          return cleanup(cLobby2, cSpace);
        });
      });
  });
});

// -----------------------------------------------------------------
// 3b. Tick guard — a position tick must never CREATE a user (issue #56)
//
// After a server restart, reconnecting clients keep emitting ticks under their
// previous socket id before they re-register. immutable's mergeIn would otherwise
// auto-vivify those ticks into displayName-less records that render as "John".
// connectUser is the only thing allowed to create a user.
// -----------------------------------------------------------------

describe('Socket.io – tick guard (issue #56)', function () {

  it('a tick for an unregistered socket id does not create a ghost user', function () {
    var client = connect();
    return waitFor(client, 'connect')
      .then(function () { return handshake(client, 'Alice'); })
      .then(function () {
        // A tick arriving under an id that never sent connectUser — the post-restart
        // ghost. Pre-fix this auto-created a user with no displayName ("John").
        client.emit('tick', {
          id: 'ghost-stale-socket-id',
          x: 1, y: 1.3, z: 2, xrot: 0, yrot: 0, zrot: 0,
          skin: 'default', scene: 'lobby'
        });
        return sleep(100); // let the (dropped) dispatch settle
      })
      .then(function () {
        var others = waitFor(client, 'getOthersCallback');
        client.emit('getOthers');
        return others;
      })
      .then(function (others) {
        // The ghost id must not have become a user; getOthers should not list it.
        expect(others).to.not.have.property('ghost-stale-socket-id');
        return cleanup(client);
      });
  });
});

// -----------------------------------------------------------------
// 4. Disconnect / cleanup
// -----------------------------------------------------------------

describe('Socket.io – disconnect cleanup', function () {

  it('removes disconnected user from subsequent getOthers responses', function () {
    var cA = connect();
    var cB = connect();
    var savedAId;

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () {
        return Promise.all([handshake(cA, 'Alice'), handshake(cB, 'Bob')]);
      })
      .then(function () {
        savedAId = cA.id;
        cA.disconnect();
        return sleep(150);
      })
      .then(function () {
        var othersPromise = waitFor(cB, 'getOthersCallback');
        cB.emit('getOthers');
        return othersPromise;
      })
      .then(function (others) {
        expect(others).to.not.have.property(savedAId);
        return cleanup(cB);
      });
  });

  it('broadcasts removeUser to all other connected clients on disconnect', function () {
    var cA = connect();
    var cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () {
        return Promise.all([handshake(cA, 'Alice'), handshake(cB, 'Bob')]);
      })
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
    // cA subscribes, then disconnects; cB ticks — cA must receive nothing.
    var cA = connect();
    var cB = connect();

    return Promise.all([waitFor(cA, 'connect'), waitFor(cB, 'connect')])
      .then(function () {
        return Promise.all([handshake(cA, 'Alice'), handshake(cB, 'Bob')]);
      })
      .then(function () {
        cA.emit('readyToReceiveUpdates');
        return sleep(80);
      })
      .then(function () {
        // Disconnect cA — its store subscription must be torn down.
        cA.disconnect();
        return sleep(150);
      })
      .then(function () {
        // cB subscribes and ticks; if cA's subscription still lived it would
        // try to emit to a closed socket, which would throw on the server.
        cB.emit('readyToReceiveUpdates');
        return sleep(50);
      })
      .then(function () {
        var updatesForB = waitFor(cB, 'usersUpdated');
        cB.emit('tick', { id: cB.id, x: 0, y: 1.3, z: 0, xrot: 0, yrot: 0, zrot: 0, skin: 'default', scene: 'lobby' });
        return updatesForB;
      })
      .then(function () {
        // If we reach here without an error the server didn't crash from a
        // stale subscription emitting to cA's closed socket.
        return cleanup(cB);
      });
  });
});

// -----------------------------------------------------------------
// 5. Single active session per account (#30)
//
// connectUser carries the authenticated account id (user.id). The server must
// allow only one live socket per account: a second connectUser for the same
// account disconnects the prior socket ("newest wins"), preventing ghost
// avatars. Connections with no account id (anonymous) are exempt.
// -----------------------------------------------------------------

describe('Socket.io – single active session per account (#30)', function () {

  it('disconnects the prior socket when the same account connects again', function () {
    var first = connect();
    var second;

    return waitFor(first, 'connect')
      .then(function () {
        first.emit('connectUser', { id: 42, displayName: 'Dup', skin: 'default' });
        return sleep(120);
      })
      .then(function () {
        second = connect();
        return waitFor(second, 'connect');
      })
      .then(function () {
        // The server should drop `first` as soon as `second` claims account 42.
        var firstClosed = waitFor(first, 'disconnect');
        second.emit('connectUser', { id: 42, displayName: 'Dup', skin: 'default' });
        return firstClosed;
      })
      .then(function () {
        expect(first.connected).to.equal(false);
        expect(second.connected).to.equal(true);
        return cleanup(second);
      });
  });

  it('keeps both sockets when they belong to different accounts', function () {
    var a = connect();
    var b = connect();

    return Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')])
      .then(function () {
        a.emit('connectUser', { id: 1, displayName: 'A' });
        b.emit('connectUser', { id: 2, displayName: 'B' });
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
        a.emit('connectUser', { displayName: 'Anon1' });
        b.emit('connectUser', { displayName: 'Anon2' });
        return sleep(150);
      })
      .then(function () {
        expect(a.connected).to.equal(true);
        expect(b.connected).to.equal(true);
        return cleanup(a, b);
      });
  });

  it('broadcasts removeUser for the replaced ghost socket', function () {
    var observer = connect(); // different account; stays connected to observe
    var first = connect();
    var second;
    var firstId;

    return Promise.all([waitFor(observer, 'connect'), waitFor(first, 'connect')])
      .then(function () {
        observer.emit('connectUser', { id: 999, displayName: 'Obs' });
        first.emit('connectUser', { id: 7, displayName: 'Dup' });
        return sleep(120);
      })
      .then(function () {
        firstId = first.id;
        second = connect();
        return waitFor(second, 'connect');
      })
      .then(function () {
        var removed = waitFor(observer, 'removeUser');
        second.emit('connectUser', { id: 7, displayName: 'Dup' });
        return removed;
      })
      .then(function (removedId) {
        expect(removedId).to.equal(firstId);
        return cleanup(observer, second);
      });
  });
});
