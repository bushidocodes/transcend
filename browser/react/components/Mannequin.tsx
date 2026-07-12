import '../../aframeComponents/wearable-skin.ts';

interface Props {
  x: string;
  y: string;
  z: string;
  xrot: string;
  yrot: string;
  zrot: string;
  skin: string;
  nickname: string;
}

export default (props: Props) => {
  return (
    <a-entity
      geometry="primitive: cylinder; radius:0.5; height:1.5"
      material="opacity: 0;"
      id={props.skin}
      position={`${props.x} ${props.y} ${props.z}`}
      rotation={`${props.xrot} ${props.yrot} ${props.zrot}`}
      wearable-skin
    >
      <a-minecraft
        position="0 0.5 0"
        minecraft={`skinUrl: ../../images/${props.skin}.png;  component: head; heightMeter: 0.4`}
        minecraft-nickname={props.nickname}
      />
      <a-minecraft
        position="0 0.5 0"
        minecraft={`skinUrl: ../../images/${props.skin}.png;  component: body; heightMeter: 0.4`}
      />
    </a-entity>
  );
};
