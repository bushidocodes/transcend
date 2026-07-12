// Pins the wire protocol (issue #117). The EVENTS values ARE the bytes on the wire: deployed
// clients keep running against a newer server (and vice versa during a rolling restart), so
// renaming a constant's VALUE is a breaking protocol change even though every in-repo usage
// would still compile. This test makes that a deliberate act instead of a refactor accident.
// describe/it/expect are Vitest globals (test.globals).

import { EVENTS, isObject, validJoinScene, validRoom } from './protocol.ts';

describe('wire protocol', () => {
  it('event names match the deployed wire strings exactly', () => {
    expect(EVENTS).toEqual({
      // client -> server
      JOIN_SCENE: 'joinScene',
      READY: 'ready',
      TICK: 'tick',
      CHANGE_SKIN: 'changeSkin',
      CHANGE_SCENE: 'changeScene',
      LOGOUT_USER: 'logoutUser',
      JOIN_CHAT_ROOM: 'joinChatRoom',
      LEAVE_CHAT_ROOM: 'leaveChatRoom',
      RELAY_ICE_CANDIDATE: 'relayICECandidate',
      RELAY_SESSION_DESCRIPTION: 'relaySessionDescription',
      // server -> client
      SCENE_STATE: 'sceneState',
      USERS_UPDATED: 'usersUpdated',
      REMOVE_USER: 'removeUser',
      SESSION_REPLACED: 'sessionReplaced',
      ADD_PEER: 'addPeer',
      REMOVE_PEER: 'removePeer',
      ICE_CANDIDATE: 'iceCandidate',
      SESSION_DESCRIPTION: 'sessionDescription',
      // socket.io built-ins
      CONNECTION: 'connection',
      CONNECT: 'connect',
      DISCONNECT: 'disconnect'
    });
  });

  it('event values are unique (no two constants share a wire string)', () => {
    const values = Object.values(EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });

  describe('payload validators (#112)', () => {
    it('isObject accepts objects and rejects null/primitives', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ x: 1 })).toBe(true);
      expect(isObject(null)).toBe(false);
      expect(isObject('tick')).toBe(false);
      expect(isObject(42)).toBe(false);
      expect(isObject(undefined)).toBe(false);
    });

    it('validJoinScene requires a user object and a string (or absent) scene', () => {
      expect(validJoinScene({ displayName: 'A' }, 'lobby')).toBe(true);
      expect(validJoinScene({ displayName: 'A' }, undefined)).toBe(true);
      expect(validJoinScene({ displayName: 'A' }, null)).toBe(true);
      expect(validJoinScene(null, 'lobby')).toBe(false);
      expect(validJoinScene('A', 'lobby')).toBe(false);
      expect(validJoinScene({ displayName: 'A' }, { evil: true })).toBe(false);
    });

    it('validRoom requires a string', () => {
      expect(validRoom('lobby')).toBe(true);
      expect(validRoom('')).toBe(true);
      expect(validRoom({ room: 'lobby' })).toBe(false);
      expect(validRoom(7)).toBe(false);
      expect(validRoom(undefined)).toBe(false);
    });
  });
});
