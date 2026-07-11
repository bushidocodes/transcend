// The set of skin ids the server accepts. Each value is interpolated into a
// `skinUrl: ../../images/${skin}.png` A-Frame component string rendered on every client, so it
// must be validated server-side (issue #79) — otherwise an authenticated user could persist an
// arbitrary string (path traversal, A-Frame component injection seen by other users, unbounded
// length). Shared by the REST skin endpoint (server/auth.js) and the changeSkin socket event
// (server/socket.js, issue #113).
//
// Derived from the shared catalog (issue #119) so this whitelist and the ChangingRoom
// mannequins can't drift; the catalog itself lives in shared/skins.js.

const { SKINS } = require('../shared/skins');

module.exports = new Set(SKINS.map(skin => skin.id));
