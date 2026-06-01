import React, { useEffect } from 'react';
import { connect } from 'react-redux';
import { Outlet } from 'react-router-dom';
import '../../aframeComponents/scene-load';
import '../../aframeComponents/aframe-minecraft';
import AssetLoader from './AssetLoader';
import LoadingSpinner from './LoadingSpinner';

/* ----------------- COMPONENT ------------------ */

const style = { 'width': '100%', 'height': '100%' };

function App (props) {
  // Emit connectUser when the VR scene first mounts so the server spawns this
  // user's avatar and begins pushing usersUpdated ticks (see server/socket.js).
  useEffect(() => {
    if (props.auth && props.auth.has('id')) {
      window.socket.emit('connectUser', props.auth);
    }
  }, []);

  return (
    // AssetLoader is a stateless component containing the a-assets for all of the React components
    //   rendered via props.children. It must reside here because A-Frame requires a-assets to a
    //   direct child of a-scene.
    // The LoadingSpinner hides the a-scene by pushing it below the visible screen until loaded
    <div style={style}>
      {!props.isLoaded ? (
        <LoadingSpinner />
      )
        : null
      }
      <a-scene id="scene" scene-load>
        <AssetLoader />
        <Outlet />
      </a-scene>
    </div>
  );
}

/* ----------------- CONTAINER ------------------ */

const mapStateToProps = state => ({
  isLoaded: state.isLoaded,
  auth: state.auth,
});

export default connect(mapStateToProps)(App);
