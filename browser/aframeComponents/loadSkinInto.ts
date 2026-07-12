// Token-guarded Minecraft skin loader, extracted from aframe-minecraft.ts.
//
// Why this exists: every character first loads the default 3djesus skin in its
// constructor, then the `minecraft` component's update() immediately loads the
// user's real skin. Both loads use an async Image().onload and write the SAME
// shared texture, so whichever image decodes LAST wins. Decode order depends on
// network/cache timing, so the default skin can randomly clobber the real one —
// the avatar shows the wrong (default) skin with no perceptible pattern, and it
// re-races on every avatar (re)creation, including teleporter scene transitions
// (issue #50).
//
// Fix: tag each load with a monotonically increasing token stored on the host
// object. An onload applies its image only if its token is still the latest,
// making the most recent loadSkin call authoritative regardless of completion
// order. Extracted into its own module (with an injectable Image constructor)
// so the race fix can be unit-tested without pulling in aframe/three/WebGL.
//
// `host` is the THREEx.MinecraftChar instance (untyped vendored code, hence
// `any`): it carries the mutable `_skinLoadSeq` token and the shared `texture`.
// `ImageCtor` defaults to the browser's window.Image so production behavior is
// unchanged (the tests inject a manually-fired fake).
export function loadSkinInto(
  host: any,
  url: string,
  onLoad?: ((host: any) => void) | null,
  ImageCtor?: any
) {
  const Img = ImageCtor || window.Image;
  const token = (host._skinLoadSeq = (host._skinLoadSeq || 0) + 1);
  const image = new Img();
  image.onload = () => {
    if (token !== host._skinLoadSeq) return; // a newer skin was requested; drop this stale load
    host.texture.image = image;
    host.texture.needsUpdate = true;
    onLoad && onLoad(host);
  };
  image.src = url;
  return host; // for chained API
}
