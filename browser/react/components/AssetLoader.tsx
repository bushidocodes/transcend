export default function AssetLoader() {
  return (
    <a-assets timeout="60000">
      {/* Lobby assets */}
      <a-mixin id="chair-part" geometry="primitive: box" material="color: #BFBFBF"></a-mixin>

      {/* Cat GIF Room assets */}
      <img id="pusheen" src="/img/cats/pusheen.gif" />
      <img id="pusheen_gangnam" src="/img/cats/pusheen_gangnam.gif" />
      <img id="nyancat" src="/img/cats/nyancat.gif" />
      <img id="bwcat" src="/img/cats/bwcat.gif" />
      <img id="lasercat" src="/img/cats/lasercat.gif" />
    </a-assets>
  );
}
