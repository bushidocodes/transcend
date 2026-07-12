import AFRAME from 'aframe';
import store from '../redux/store.ts';
import { EVENTS } from '../../shared/protocol.ts';
import { getSocket } from '../socket-holder.ts';
import { updateMuteButtonPosition } from './update-mute-button-position.ts';

// This component is attached to the user who the scene belongs to.
// A-Frame calls tick() every animation frame, but we publish position only every Nth frame,
// where N is the server-provided tickRate delivered in the sceneState handshake and stored in
// Redux (issues #59/#69). A null tickRate means we haven't joined yet — don't publish. This
// also replaces the old socket.on('startTick') gate (no socket listener here anymore, #75).

export default AFRAME.registerComponent('publish-location', {
  init: function (this: any) {
    this.frame = 0;
  },
  tick: function (this: any) {
    const tickRate = store.getState().config.tickRate;
    if (!tickRate) return; // not joined / no rate yet
    this.frame += 1;
    if (this.frame % tickRate !== 0) return;

    // Pose only (issue #113): the server keys the update on the socket's own identity and
    // ignores everything else, so id no longer rides along, and skin/scene travel via the
    // dedicated changeSkin/changeScene events instead of every tick.
    const el = this.el;
    const userPosition = {
      x: el.getAttribute('position').x,
      y: el.getAttribute('position').y,
      z: el.getAttribute('position').z,
      xrot: el.getAttribute('rotation').x,
      yrot: el.getAttribute('rotation').y,
      zrot: el.getAttribute('rotation').z
    };
    // Null-guard: #mutebutton is destroyed on logout while tick may still fire (#202).
    updateMuteButtonPosition(userPosition);
    // getSocket() is null pre-init (see socket-holder.ts); skip the emit rather than crash
    // if a tick races login/teardown.
    getSocket()?.emit(EVENTS.TICK, userPosition);
  }
});
