import AFRAME from 'aframe';
import store from '../redux/store.ts';

// Places buttons at the user's feet to mute self, mute people in the room, and see who is currently in the room

AFRAME.registerComponent('mute-self', {
  schema: {
    type: 'boolean',
    default: false
  },
  // I stole most of this code form aframe-hyperlink, it didn't work exactly how I wanted it to.
  init: function (this: any) {
    this.handler = this.handler.bind(this);
    this.el.addEventListener('click', this.handler);
    this.el.addEventListener('gripdown', this.handler);
  },
  remove: function (this: any) {
    this.el.removeEventListener('click', this.handler);
    this.el.removeEventListener('gripdown', this.handler);
  },
  handler: function (this: any) {
    console.log('Muting');
    const stream = store.getState().webrtc.localMediaStream;
    console.log('stream', stream);
    // No mic stream (user denied access or it never initialized) — nothing to mute. Bail out
    // instead of throwing on stream.getAudioTracks(), which would crash the click handler.
    if (!stream) {
      console.warn('mute-self: no local media stream; ignoring toggle');
      return;
    }
    const isEnabled = stream.getAudioTracks()[0].enabled;
    console.log('enabled', isEnabled);
    // transparent:true so the mic PNG's transparent background isn't drawn as an opaque tile
    // (A-Frame 0.4 auto-enabled this for alpha textures; 1.x requires it explicitly).
    if (isEnabled) {
      this.el.setAttribute('material', 'src: /img/microphone-mute.png; transparent: true');
    } else {
      this.el.setAttribute('material', 'src: /img/microphone-unmute.png; transparent: true');
    }
    stream.getAudioTracks()[0].enabled = !isEnabled;
  }
});
