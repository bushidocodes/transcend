import { Component } from 'react';
import Teleporter from './Teleporter.tsx';
import Mannequin from './Mannequin.tsx';
import Room from './Room.tsx';
import { SKINS } from '../../../shared/skins.ts';
import { roomLabel, DEFAULT_ROOM } from '../../rooms.ts';

// One mannequin per catalog entry (shared/skins.ts, issue #119) — the same list the server
// validates changeSkin against, so every mannequin here is guaranteed wearable. Layout: two
// facing rows of 12, x from -14 in steps of 2.
const MANNEQUINS_PER_ROW = 12;

// WebRTC chat join/leave is handled centrally by <App> on scene change (issue #70).
export default class ChangingRoom extends Component {
  render () {
    return (
      <a-entity>
        <Room
          floorWidth='50'
          floorHeight='50'
          wallHeight='25'
          wallColor='#BB96FF'
          floorColor=''
          floorTexture='/img/carpet2.jpg'
          ceilingColor='#998403'
        />

        {SKINS.map((skin, i) => {
          const backRow = i >= MANNEQUINS_PER_ROW;
          return (
            <Mannequin
              key={skin.id}
              x={`${-14 + (i % MANNEQUINS_PER_ROW) * 2}`}
              y='0.75'
              z={backRow ? '-5' : '5'}
              xrot='0'
              yrot={backRow ? '180' : '0'}
              zrot='0'
              skin={skin.id}
              nickname={skin.label}
            />
          );
        })}

        <Teleporter
          color='green'
          label={roomLabel(DEFAULT_ROOM)}
          href='/vr'
          rotation='90'
          x='-24.5' y='1' z='-5'
          labelx='-1' labely='1'
        />
      </a-entity>
    );
  }
}
