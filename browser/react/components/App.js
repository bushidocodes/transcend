import React, { useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { Outlet } from 'react-router-dom';
import '../../aframeComponents/scene-load';
import '../../aframeComponents/aframe-minecraft';
import AssetLoader from './AssetLoader';
import LoadingSpinner from './LoadingSpinner';

/* ----------------- COMPONENT ------------------ */

const style = { 'width': '100%', 'height': '100%' };

function App (props) {
  // Gate the room (Outlet) on <a-assets> finishing. Room entities reference assets by selector
  // (e.g. material="src: #slide", gltf-model="#monitor"). If A-Frame parses those before the
  // a-assets <img>/<a-asset-item> children are registered, the selector resolves to null and the
  // texture/model silently never loads — and A-Frame doesn't retry. Under React 18 + A-Frame 1.7
  // that race fires intermittently, so images/monitors went missing on some loads. Waiting for
  // a-assets 'loaded' guarantees the assets exist before any room entity is created.
  const [assetsReady, setAssetsReady] = useState(false);

  // Emit connectUser when the VR scene first mounts so the server spawns this
  // user's avatar and begins pushing usersUpdated ticks (see server/socket.js).
  useEffect(() => {
    if (props.auth && props.auth.has('id')) {
      window.socket.emit('connectUser', props.auth);
    }
  }, []);

  useEffect(() => {
    const assets = document.querySelector('#scene a-assets');
    if (!assets || assets.hasLoaded) { setAssetsReady(true); return; }
    const onLoaded = () => setAssetsReady(true);
    assets.addEventListener('loaded', onLoaded);
    return () => assets.removeEventListener('loaded', onLoaded);
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
        {assetsReady ? <Outlet /> : null}
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
