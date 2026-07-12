import { Component } from 'react';
import SimpleRoom from './SimpleRoom.tsx';

// WebRTC chat join/leave is handled centrally by <App> on scene change (issue #70).
// Layout lives in SimpleRoom; this file only pins the wall color (issue #236).
export default class Sean extends Component {
  render() {
    return <SimpleRoom wallColor="red" />;
  }
}
