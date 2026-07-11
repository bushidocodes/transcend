// Unit tests for GameState, the plain domain-state container that replaced the server-side
// Redux store (issue #116). describe/it/expect/beforeEach are Vitest globals (test.globals).

const GameState = require('./game-state');

let state;

beforeEach(() => {
  state = new GameState();
});

describe('GameState', () => {
  describe('addUser', () => {
    it('creates a full user record with defaults and the given scene', () => {
      const user = state.addUser('s1', { displayName: 'Alice', skin: 'batman' }, 'lobby');

      expect(user.id).toBe('s1');
      expect(user.displayName).toBe('Alice');
      expect(user.skin).toBe('batman');
      expect(user.scene).toBe('lobby');
      expect(user.y).toBe(1.3);
      expect(user.xrot).toBe(0);
      expect(user.yrot).toBe(0);
      expect(user.zrot).toBe(0);
      expect(Number.isFinite(user.x)).toBe(true);
      expect(Number.isFinite(user.z)).toBe(true);
      expect(state.getUser('s1')).toBe(user);
    });

    it('treats a missing scene as the not-yet-placed empty room', () => {
      const user = state.addUser('s1', { displayName: 'Alice' });
      expect(user.scene).toBe('');
    });

    it('replaces an existing record for the same id', () => {
      state.addUser('s1', { displayName: 'Old' }, 'lobby');
      state.addUser('s1', { displayName: 'New' }, 'spaceroom');
      expect(state.getUser('s1').displayName).toBe('New');
      expect(state.getUser('s1').scene).toBe('spaceroom');
    });
  });

  describe('updatePose', () => {
    it('merges finite pose fields onto an existing user', () => {
      state.addUser('s1', { displayName: 'Alice' }, 'lobby');
      const user = state.updatePose('s1', { x: 5, y: 1.8, z: -3, xrot: 1, yrot: 90, zrot: -2 });

      expect(user.x).toBe(5);
      expect(user.y).toBe(1.8);
      expect(user.z).toBe(-3);
      expect(user.xrot).toBe(1);
      expect(user.yrot).toBe(90);
      expect(user.zrot).toBe(-2);
    });

    it('never creates a user for an unknown id (the #56 ghost guard)', () => {
      expect(state.updatePose('ghost-stale-socket-id', { x: 1, y: 1.3, z: 2 })).toBeNull();
      expect(state.getUser('ghost-stale-socket-id')).toBeUndefined();
      expect(state.users.size).toBe(0);
    });

    it('drops non-finite values and keeps the previous pose', () => {
      state.addUser('s1', { displayName: 'Alice' }, 'lobby');
      state.updatePose('s1', { x: 5, y: 1.3, z: -3 });
      const user = state.updatePose('s1', { x: 'not-a-number', y: null, z: Infinity, yrot: 42 });

      expect(user.x).toBe(5);
      expect(user.y).toBe(1.3);
      expect(user.z).toBe(-3);
      expect(user.yrot).toBe(42); // the one finite field still merged
    });

    it('ignores non-pose fields entirely (identity comes from joinScene, #113)', () => {
      state.addUser('s1', { displayName: 'Alice', skin: 'batman' }, 'lobby');
      const user = state.updatePose('s1', {
        x: 3, displayName: 'Hacked', skin: 'god', scene: 'spaceroom', id: 'someone-else'
      });

      expect(user.x).toBe(3);
      expect(user.displayName).toBe('Alice');
      expect(user.skin).toBe('batman');
      expect(user.scene).toBe('lobby');
      expect(user.id).toBe('s1');
    });
  });

  describe('setSkin / setScene', () => {
    it('setSkin updates an existing user and is a no-op for unknown ids', () => {
      state.addUser('s1', { displayName: 'Alice', skin: 'default' }, 'lobby');
      expect(state.setSkin('s1', 'batman').skin).toBe('batman');
      expect(state.setSkin('nobody', 'batman')).toBeNull();
      expect(state.getUser('nobody')).toBeUndefined();
    });

    it('setScene moves the user and reports the previous scene', () => {
      state.addUser('s1', { displayName: 'Alice' }, 'lobby');
      const change = state.setScene('s1', 'spaceroom');
      expect(change.from).toBe('lobby');
      expect(change.user.scene).toBe('spaceroom');
      expect(state.setScene('nobody', 'spaceroom')).toBeNull();
    });
  });

  describe('removeUser', () => {
    it('deletes the record and returns it', () => {
      state.addUser('s1', { displayName: 'Alice' }, 'lobby');
      const removed = state.removeUser('s1');
      expect(removed.scene).toBe('lobby');
      expect(state.getUser('s1')).toBeUndefined();
    });

    it('returns undefined for an id that was never added', () => {
      expect(state.removeUser('nobody')).toBeUndefined();
    });
  });

  describe('usersInScene / peersOf', () => {
    beforeEach(() => {
      state.addUser('a', { displayName: 'Alice' }, 'lobby');
      state.addUser('b', { displayName: 'Bob' }, 'lobby');
      state.addUser('c', { displayName: 'Cara' }, 'spaceroom');
    });

    it('usersInScene returns every user in the scene, keyed by id', () => {
      const lobby = state.usersInScene('lobby');
      expect(Object.keys(lobby).sort()).toEqual(['a', 'b']);
      expect(lobby.a.displayName).toBe('Alice');
    });

    it('peersOf excludes the user itself and other-scene users', () => {
      const peers = state.peersOf('a');
      expect(peers).not.toHaveProperty('a');
      expect(peers).toHaveProperty('b');
      expect(peers).not.toHaveProperty('c');
    });

    it('peersOf is empty for an unknown id', () => {
      expect(state.peersOf('nobody')).toEqual({});
    });

    it('users who have not reported a scene share the empty not-yet-placed room', () => {
      state.addUser('d', { displayName: 'Dana' });
      state.addUser('e', { displayName: 'Eve' });
      expect(state.peersOf('d')).toHaveProperty('e');
      expect(state.peersOf('d')).not.toHaveProperty('a');
    });
  });
});
