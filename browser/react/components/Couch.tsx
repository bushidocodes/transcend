interface Props {
  x: string;
  y: string;
  z: string;
  rotx: string;
  roty: string;
  rotz: string;
}

// No static id: multiple couches share a scene; a shared id="couch" would be invalid HTML
// and break any future getElementById / A-Frame selector (issue #237).
export default (props: Props) => (
  <a-entity
    position={`${props.x} ${props.y} ${props.z}`}
    rotation={`${props.rotx} ${props.roty} ${props.rotz}`}
  >
    <a-entity
      geometry="primitive: box; depth: 1.5; height: 0.5; width: 4"
      material="color: #666666"
      position="0 0.25 0"
    ></a-entity>
    <a-entity
      geometry="primitive: box; depth: 0.25; height: 1; width: 4"
      material="color: #666666"
      position="0 0.5 0.75"
    ></a-entity>
    <a-entity
      geometry="primitive: cylinder; height: 1.5; radius: 0.15"
      material="color: #666666"
      position="1.9 0.55 0"
      rotation="90 0 0"
    ></a-entity>
    <a-entity
      geometry="primitive: cylinder; height: 1.5; radius: 0.15"
      material="color: #666666"
      position="-1.9 0.55 0"
      rotation="90 0 0"
    ></a-entity>
  </a-entity>
);
