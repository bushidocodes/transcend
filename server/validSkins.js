// The complete set of selectable skins, mirroring the Mannequins offered in the
// ChangingRoom (browser/react/components/ChangingRoom.js). Each value is the basename of a
// file in public/images/ and is interpolated into a `skinUrl: ../../images/${skin}.png`
// A-Frame component string rendered on every client, so it must be validated server-side
// (issue #79) — otherwise an authenticated user could persist an arbitrary string (path
// traversal, A-Frame component injection seen by other users, unbounded length).
// Shared by the REST skin endpoint (server/auth.js) and the changeSkin socket event
// (server/socket.js, issue #113).
module.exports = new Set([
  '3djesus', 'agentsmith', 'batman', 'char', 'god', 'Iron-Man-Minecraft-Skin', 'jetienne',
  'Joker', 'Mario', 'martialartist', 'robocop', 'Sonicthehedgehog', 'woody', 'powerRanger',
  'catwoman', 'blackWidow', 'evilQueen', 'graceHopper', 'princessBelle', 'skaterGirl',
  'katnissEverdeen', 'theflash', 'Superman', 'Spiderman'
]);
