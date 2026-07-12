interface Props {
  x: string;
  y: string;
  z: string;
  color: string;
  legHeight: string;
  depth: string;
}

// legHeight arrives as an attribute-style string; Number() before dividing matches what JS's
// `/` did implicitly on the string operand (ToNumber), so positions are unchanged.
export default (props: Props) => (
  <a-entity id='table' position={`${props.x} ${props.y} ${props.z}`}>
    <a-entity
      geometry={`primitive: box; depth: ${props.depth}; height: 0.20; width: 3`}
      material={`color: ${props.color}`}
      position={`0 ${props.legHeight} 0`}
    >
    </a-entity>
    <a-entity
      geometry={`primitive: box; depth: ${props.depth}; height: ${props.legHeight}; width: 0.10`}
      material={`color: ${props.color}`}
      position={`1.45 ${Number(props.legHeight) / 2} 0`}
    >
    </a-entity>
    <a-entity
      geometry={`primitive: box; depth: ${props.depth}; height: ${props.legHeight}; width: 0.10`}
      material={`color: ${props.color}`}
      position={`-1.45 ${Number(props.legHeight) / 2} 0`}
    >
    </a-entity>
  </a-entity>
);
