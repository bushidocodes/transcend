import AFRAME from 'aframe';
import store from '../redux/store';
import { setAsLoaded } from '../redux/reducers/is-loaded-reducer';

// This component ensures the scene loads before anything else can happen.
// Without it, race conditions start occurring where entities are being accessed
// before being placed on the DOM.
//
// It used to also emit 'sceneLoad' to gate the server's renderAvatar, but the handshake was
// collapsed into a single joinScene/sceneState exchange (issue #69), so that's gone — this now
// just flips the client's isLoaded flag (which hides the loading spinner).

export default AFRAME.registerComponent('scene-load', {
  init: function () {
    console.log('scene-load component initialized');
    store.dispatch(setAsLoaded());
  }
});
