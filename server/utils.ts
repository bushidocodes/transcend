import type { SceneUser } from '../shared/protocol.ts';

// The server-side user record — one per connected avatar, keyed by socket id. Implements the
// wire shape (SceneUser) directly: this object IS what sceneState/usersUpdated serialize.
export class User implements SceneUser {
  id: string;
  displayName?: string;
  skin?: string;
  x: number;
  y: number;
  z: number;
  xrot: number;
  yrot: number;
  zrot: number;
  scene: string;

  constructor(id: string, displayName?: string, skin?: string) {
    this.id = id;
    this.displayName = displayName;
    this.skin = skin;
    this.x = Math.random() * 30 - 15;
    this.y = 1.3;
    this.z = Math.random() * 30 - 15;
    this.xrot = 0;
    this.yrot = 0;
    this.zrot = 0;
    this.scene = ''; // VR scene
  }
}
