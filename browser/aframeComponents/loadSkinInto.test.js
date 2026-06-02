'use strict';

/**
 * Regression test for issue #50 — "Minecraft Avatar occasionally does not load
 * the correct skin when added to a scene."
 *
 * Root cause: a character first loads the default 3djesus skin in its constructor,
 * then the `minecraft` component's update() loads the real skin. Both loads share
 * one texture and complete via async Image().onload, so whichever image decodes
 * LAST wins. When the default load happens to finish after the real one, the avatar
 * is left wearing the default skin at random.
 *
 * loadSkinInto guards against this with a monotonic per-host token: a stale onload
 * is dropped instead of overwriting a newer load. These tests drive the real
 * exported function with a fake, manually-fired Image so the race is deterministic.
 */

import { expect } from 'chai';
import { loadSkinInto } from './loadSkinInto';

// A minimal stand-in for the browser's Image: records each instance so the test
// can fire onload by hand, and remembers the assigned src.
function makeFakeImageCtor (created) {
  return function FakeImage () {
    const img = this;
    img.onload = null;
    Object.defineProperty(img, 'src', {
      configurable: true,
      get () { return img._src; },
      set (v) { img._src = v; }
    });
    created.push(img);
  };
}

function newHost () {
  return { texture: { image: null, needsUpdate: false } };
}

describe('loadSkinInto – skin texture race guard (issue #50)', function () {
  it('a stale (default) load that finishes LAST does not clobber the newer (real) skin', function () {
    const created = [];
    const Img = makeFakeImageCtor(created);
    const host = newHost();

    // Load A = the default skin (kicked off first, in the constructor).
    loadSkinInto(host, 'default.png', null, Img);
    // Load B = the real skin (kicked off second, by the minecraft component's update()).
    loadSkinInto(host, 'real.png', null, Img);

    const [imgA, imgB] = created;
    // The real skin decodes first...
    imgB.onload();
    // ...then the default skin decodes LATE. Without the token guard this overwrites
    // the real skin (the bug). With it, the stale load is dropped.
    imgA.onload();

    expect(host.texture.image).to.equal(imgB);
    expect(host.texture.image.src).to.equal('real.png');
  });

  it('the newest load wins even when loads complete in request order', function () {
    const created = [];
    const Img = makeFakeImageCtor(created);
    const host = newHost();

    loadSkinInto(host, 'default.png', null, Img);
    loadSkinInto(host, 'real.png', null, Img);

    const [imgA, imgB] = created;
    imgA.onload(); // stale completes first (it applies, harmlessly)...
    imgB.onload(); // ...newest completes last and wins

    expect(host.texture.image).to.equal(imgB);
    expect(host.texture.image.src).to.equal('real.png');
  });

  it('a normal single load applies its image, flags needsUpdate, and fires onLoad', function () {
    const created = [];
    const Img = makeFakeImageCtor(created);
    const host = newHost();

    let callbackArg = null;
    loadSkinInto(host, 'real.png', h => { callbackArg = h; }, Img);
    created[0].onload();

    expect(host.texture.image).to.equal(created[0]);
    expect(host.texture.needsUpdate).to.equal(true);
    expect(callbackArg).to.equal(host);
  });
});
