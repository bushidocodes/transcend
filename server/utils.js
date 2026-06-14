// User constructor
function User (id, displayName, skin) {
  this.id = id;
  this.displayName = displayName;
  this.skin = skin;
  this.x = Math.random() * 30 - 15;
  this.y = 1.3;
  this.z = Math.random() * 30 - 15;
  this.xrot = 0;
  this.yrot = 0;
  this.zrot = 0;
  this.scene = '';  // VR scene
}

// Returns the other users in the SAME room as the user identified by `id` (excluding that
// user). Room identity is the `scene` field, which the client sets via joinScene and keeps
// fresh on every position tick. Filtering here (rather than on every client) keeps cross-room
// position data off the wire entirely (issue #58). Two users who haven't reported a scene yet
// both have '' and are treated as sharing the same (empty) not-yet-placed room.
function getRoomPeers (users, id) {
  const self = users.get(id);
  const scene = self ? self.get('scene') : undefined;
  return users.filter(userData =>
    userData.get('id') !== id && userData.get('scene') === scene
  );
}

module.exports = {
  User,
  getRoomPeers
};
