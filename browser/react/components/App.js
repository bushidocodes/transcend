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
  // Gate the room (Outlet) on <a-assets> finishing. Under React 18 + A-Frame 1.7, an entity that
  // references an asset by #id selector can parse before <a-assets> has registered the matching
  // element, resolving to null with no retry. The static images / gltf monitors / floors now use
  // direct URLs (race-immune), but the cat-room gif materials still reference assets by selector,
  // so waiting for a-assets 'loaded' before creating any room entity keeps those resolving too.
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
