import { Component } from 'react';
import Teleporter from './Teleporter.tsx';
import Room from './Room.tsx';

// WebRTC chat join/leave is handled centrally by <App> on scene change (issue #70).
export default class Joey extends Component {
  render() {
    return (
      <a-entity>
        <Room
          floorWidth="50"
          floorHeight="50"
          wallHeight="25"
          wallColor="blue"
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
