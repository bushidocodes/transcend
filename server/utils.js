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

module.exports = {
  User
};
