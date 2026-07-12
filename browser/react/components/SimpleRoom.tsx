import { Component } from 'react';
import Teleporter from './Teleporter.tsx';
import Room from './Room.tsx';

// Shared layout for the near-identical Sean / Beth / Joey rooms (issue #236): same floor,
// ceiling, Lobby teleporter; only wallColor (and any future knobs) differ.

export interface SimpleRoomProps {
  wallColor: string;
}

export default class SimpleRoom extends Component<SimpleRoomProps> {
  render() {
    const { wallColor } = this.props;
    return (
      <a-entity>
        <Room
          floorWidth="50"
          floorHeight="50"
          wallHeight="25"
          wallColor={wallColor}
          floorColor=""
          floorTexture="/img/carpet2.jpg"
          ceilingColor="#998403"
        />
        <Teleporter
          color="green"
          label="Lobby"
          href="/vr"
          rotation="90"
          x="-24.5"
          y="1"
          z="-5"
          labelx="-1"
          labely="1"
        />
      </a-entity>
    );
  }
}
