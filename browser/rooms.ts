// The room manifest (issue #119): route path and display label for every VR room, defined
// once. The router (browser/react/index.tsx) generates its /vr routes from this — it maps each
// path to a component and asserts the two lists agree at startup — and teleporter labels read
// from it via roomLabel(). Adding a room is one entry here plus its component mapping in the
// router.
//
// Pure data on purpose: room components pull in the whole A-Frame tree, and the components
// that want labels (Lobby, ChangingRoom teleporters) would create an import cycle with a
// manifest that imported them back. The path→room-name derivation is in browser/navigate.ts
// (currentRoom) for the same reason: browser/socket.ts needs it without the component tree.

export interface Room {
  path: string;
  label: string;
}

export const ROOMS: readonly Room[] = [
  { path: 'lobby', label: 'Lobby' },
  { path: 'thebasement', label: 'The Basement' },
  { path: 'spaceroom', label: 'Space Room' },
  { path: 'catroom', label: 'Cat Room' },
  { path: 'gameroom', label: 'Game Room' },
  { path: 'thegap', label: 'The Gap' }
];

// Where the bare /vr index redirects.
export const DEFAULT_ROOM = 'lobby';

// Display label for a room's route path (teleporter labels).
export function roomLabel (path: string): string {
  const room = ROOMS.find(r => r.path === path);
  return room ? room.label : path;
}
