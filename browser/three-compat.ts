// Compatibility shims for libraries written against older three.js, applied once at startup.
//
// A-Frame 1.7 bundles modern three (super-three ~r173). aframe-gif-shader@0.9.1 was written for
// three ~r80 and breaks in two ways; both are fixed here. This module is imported first in
// browser/react/index.tsx so the fixes are in place before any `shader: gif` material loads.
import AFRAME from 'aframe';

const THREE: any = (AFRAME && AFRAME.THREE) || window.THREE;

// 1. THREE.Math was renamed to THREE.MathUtils and the old alias removed. The gif shader calls
//    THREE.Math.floorPowerOfTwo(...) when a GIF loads, throwing "Cannot read properties of
//    undefined (reading 'floorPowerOfTwo')". MathUtils is a superset, so restore the alias.
if (THREE && !THREE.Math) {
  THREE.Math = THREE.MathUtils;
}

// Register the gif shader via require (not a hoisted import) so it runs AFTER the THREE.Math
// shim above. The module self-registers AFRAME.shaders.gif; Yoonah/Lobby import it too, but ES
// module caching means it only evaluates (and registers) once.
require('aframe-gif-shader');

// Live gif shader instances, ticked each frame by the gif-ticker component below.
const gifShaders = new Set<any>();

// 3. A-Frame 1.x never calls a shader's tick(). It only re-runs a shader's update() for schema
//    properties of type 'time'; a shader's own tick() is ignored. The gif shader advances its
//    animation in tick(), so without a driver every gif freezes on frame 0. A registered
//    component's tick *is* called (the scene render loop ticks behaviors keyed by component
//    name), so this component — attached to the scene by the __ready patch — drives every gif.
if (!AFRAME.components['gif-ticker']) {
  AFRAME.registerComponent('gif-ticker', {
    tick: (time: number, delta: number) => {
      gifShaders.forEach(shader => {
        // Prune shaders whose entity left the scene (e.g. on room change) so we don't tick
        // detached materials forever.
        if (!shader.el || !shader.el.isConnected) {
          gifShaders.delete(shader);
          return;
        }
        if (shader.tick) {
          shader.tick(time, delta);
        }
      });
    }
  });
}

// 2. The shader creates its texture from a 2x2 canvas, then resizes that same canvas to a
//    power-of-two and flags needsUpdate. Modern three sees the same image object and does a
//    sub-image upload (texSubImage) into the stale 2x2 GPU allocation, overflowing it
//    ("glCopySubTextureCHROMIUM: Offset overflows texture dimensions"), so every gif renders
//    black. Disposing after the resize drops the GPU allocation and forces a full re-upload at
//    the new size. Same-size per-frame updates afterwards are fine.
//
//    We also use __ready (fired once per gif load) to register the shader for ticking and to
//    ensure the scene carries the gif-ticker component.
const gif = AFRAME.shaders && AFRAME.shaders.gif;
const proto = gif && gif.Shader && gif.Shader.prototype;
if (proto && proto.__ready && !proto.__readyPatchedForModernThree) {
  const origReady = proto.__ready;
  proto.__ready = function patchedReady(this: any) {
    const result = origReady.apply(this, arguments);
    if (this.__texture) this.__texture.dispose();
    gifShaders.add(this);
    const sceneEl = this.el && this.el.sceneEl;
    if (sceneEl && !sceneEl.hasAttribute('gif-ticker')) {
      sceneEl.setAttribute('gif-ticker', '');
    }
    return result;
  };
  proto.__readyPatchedForModernThree = true;
}
