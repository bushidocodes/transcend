import React, { useEffect, useState, useRef } from 'react';
import { connect } from 'react-redux';
import { Outlet } from 'react-router-dom';
import '../../aframeComponents/scene-load';
import '../../aframeComponents/aframe-minecraft';
import AssetLoader from './AssetLoader';
import LoadingSpinner from './LoadingSpinner';
import { initSocket } from '../../socket';

/* ----------------- COMPONENT ------------------ */

const style = { 'width': '100%', 'height': '100%' };

function App (props) {
  // Gate the room (Outlet) on <a-assets> finishing. Under React 18 + A-Frame 1.7, an entity that
  // references an asset by #id selector can parse before <a-assets> has registered the matching
  // element, resolving to null with no retry. The static images / gltf monitors / floors now use
  // direct URLs (race-immune), but the cat-room gif materials still reference assets by selector,
  // so waiting for a-assets 'loaded' before creating any room entity keeps those resolving too.
  const [assetsReady, setAssetsReady] = useState(false);
  // joinScene must be emitted exactly once, even across re-renders.
  const joinedScene = useRef(false);

  // Stage 2 (socket connection): open the socket as soon as <App> mounts — we're past auth via
  // RequireAuth, so this is the Stage 1 → Stage 2 boundary (issue #67). initSocket() is
  // idempotent and deferred from module load, so io() never fires before login and a
  // logout→login remount reuses the existing socket.
  useEffect(() => {
    initSocket();
  }, []);

  // Stage 3 (get all data): join the scene once <a-assets> has finished loading (Stage 4). A
  // single joinScene carries our identity + room and the server replies with one sceneState
  // (our avatar + the room's other users + the tick rate), collapsing the old multi-hop
  // handshake (issue #69). Gating on assetsReady keeps the server from sending scene data
  // before the scene can display it (issue #68). Guarded to emit exactly once.
  useEffect(() => {
    if (!assetsReady || joinedScene.current) return;
    if (props.auth && props.auth.has('id')) {
      joinedScene.current = true;
      const scene = window.location.pathname.replace(/\//g, '') || 'root';
      initSocket().emit('joinScene', props.auth, scene);
    }
  }, [assetsReady, props.auth]);

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
