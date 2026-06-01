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
        cA.emit('getOthers');
        cB.emit('getOthers');
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
        skin: 'steve', scene: 'spaceroom'
      });

      return updatesForB.then(function (users) {
        var a = users[cA.id];
        expect(a.x).to.equal(-7.5);
        expect(a.y).to.equal(1.8);
        expect(a.z).to.equal(12.3);
        expect(a.xrot).to.equal(5);
        expect(a.yrot).to.equal(270);
        expect(a.zrot).to.equal(-2);
        expect(a.scene).to.equal('spaceroom');
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
