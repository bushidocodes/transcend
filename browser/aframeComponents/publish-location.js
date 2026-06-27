/* global socket */

import AFRAME from 'aframe';
import store from '../redux/store';

// This component is attached to the user who the scene belongs to.
// A-Frame calls tick() every animation frame, but we publish position only every Nth frame,
// where N is the server-provided tickRate delivered in the sceneState handshake and stored in
// Redux (issues #59/#69). A null tickRate means we haven't joined yet — don't publish. This
// also replaces the old socket.on('startTick') gate (no socket listener here anymore, #75).

export default AFRAME.registerComponent('publish-location', {
  init: function () {
    this.frame = 0;
  },
  tick: function () {
    const tickRate = store.getState().config.tickRate;
    if (!tickRate) return;                 // not joined / no rate yet
    this.frame += 1;
    if (this.frame % tickRate !== 0) return;

    const el = this.el;
    const userPosition = {
      id: el.getAttribute('id'),
      x: el.getAttribute('position').x,
      y: el.getAttribute('position').y,
      z: el.getAttribute('position').z,
      xrot: el.getAttribute('rotation').x,
      yrot: el.getAttribute('rotation').y,
      zrot: el.getAttribute('rotation').z,
      skin: el.getAttribute('skin'),
      scene: window.location.pathname.replace(/\//g, '') || 'root' // room name, or root for the lobby
    };
    const mutebutton = document.getElementById('mutebutton');
    mutebutton.setAttribute('position', `${userPosition.x} 0.1 ${userPosition.z - 1}`);
    socket.emit('tick', userPosition);
  }
});
