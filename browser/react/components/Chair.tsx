interface Props {
  x: string;
  y: string;
  z: string;
}

// No static id: Lobby alone renders ~20 chairs; a shared id="chair" would be invalid HTML
// and break any future getElementById / A-Frame selector (issue #237).
export default (props: Props) => (
  <a-entity position={`${props.x} ${props.y} ${props.z}`} rotation="0 180 0">
    <a-entity
      mixin="chair-part"
      geometry="height: 1; depth: 0.05; width: 0.05"
      position="-0.25 0.5 0"
    ></a-entity>
    <a-entity
      mixin="chair-part"
      geometry="height: 1; depth: 0.05; width: 0.05"
      position="0.25 0.5 0"
    ></a-entity>
    <a-entity
      mixin="chair-part"
      geometry="height: 0.5; depth: 0.05; width: 0.05"
      position="-0.25 0.25 0.5"
    ></a-entity>
    <a-entity
      mixin="chair-part"
      geometry="height: 0.5; depth: 0.05; width: 0.05"
      position="0.25 0.25 0.5"
    ></a-entity>
    <a-entity
      mixin="chair-part"
      geometry="height: 0.05; depth: 0.05; width: 0.55"
      position="0 1 0"
    ></a-entity>
    <a-entity
      material="color: black"
      geometry="primitive: box; depth: 0.55; height: 0.05; width: 0.55"
      position="0 0.5 0.25"
    ></a-entity>
  </a-entity>
);
