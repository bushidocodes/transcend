interface Props {
  floorWidth: string;
  floorHeight: string;
  wallHeight: string;
  wallColor: string;
  floorColor: string;
  floorTexture: string;
  ceilingColor: string;
}

// Dimensions arrive as attribute-style strings; Number() before dividing matches what JS's
// `/` did implicitly on the string operands (ToNumber), so positions are unchanged.
export default (props: Props) => (
  <a-entity>
    <a-entity light="type: ambient; color: #ffffe0" position="0 0 0"></a-entity>

    <a-entity
      geometry={`primitive: plane; width:${props.floorWidth}; height:${props.floorHeight}`}
      rotation="-90 0 0"
      material={`color:${props.floorColor}; src: ${props.floorTexture}; repeat: ${props.floorWidth} ${props.floorWidth} `}
    />

    <a-entity
      geometry={`primitive: plane; width:${props.floorWidth}; height:${props.floorHeight}`}
      rotation="90 0 0"
      position={`0 ${props.wallHeight} 0`}
      material={`color: ${props.ceilingColor}`}
    />

    <a-entity
      geometry={`primitive: plane; width:${props.floorWidth}; height:${props.wallHeight}`}
      rotation="0 0 0"
      position={`0 ${Number(props.wallHeight) / 2} ${Number(props.floorHeight) / -2}`}
      material={`color: ${props.wallColor}`}
    />

    <a-entity
      geometry={`primitive: plane; width:${props.floorWidth}; height:${props.wallHeight}`}
      rotation="0 180 0"
      position={`0 ${Number(props.wallHeight) / 2} ${Number(props.floorHeight) / 2}`}
      material={`color: ${props.wallColor}; shader: flat`}
    />

    <a-entity
      geometry={`primitive: plane; width:${props.floorHeight}; height:${props.wallHeight}`}
      rotation="0 90 0"
      position={`${Number(props.floorHeight) / -2} ${Number(props.wallHeight) / 2} 0`}
      material={`color: ${props.wallColor}`}
    />

    <a-entity
      geometry={`primitive: plane; width:${props.floorHeight}; height:${props.wallHeight}`}
      rotation="0 -90 0"
      position={`${Number(props.floorHeight) / 2} ${Number(props.wallHeight) / 2} 0`}
      material={`color: ${props.wallColor}`}
    />
  </a-entity>
);
