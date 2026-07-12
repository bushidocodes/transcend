import '../../aframeComponents/aframe-hyperlink.ts';

interface Props {
  color: string;
  label: string;
  href: string;
  x: string;
  y: string;
  z: string;
  rotation?: string;
  // labelx is legacy and unused (see comment below); still accepted so call sites can keep it.
  labelx?: string;
  labely?: string;
}

export default function Teleporter (props: Props) {
  // Requires: x, y, z, rotation, label
  // The orb sits at this entity's local origin, so the label is centered directly above it.
  // (The legacy labelx/labelz props were horizontal nudges tuned to the old left-anchored
  // aframe-text-component; built-in text with align:center centers on its own origin, so we
  // place the label at local x/z = 0 and only keep labely for height above the orb.)
  const yOffset = props.labely || 1;
  const rotation = props.rotation || 0;

  return (
    <a-entity position={`${props.x} ${props.y} ${props.z}`} rotation={`0 ${rotation} 0`}>
      {/* Built-in text needs an SDF/MSDF font, not the three.js typeface.json used pre-1.x.
          Omitting `font` falls back to A-Frame's bundled `roboto` SDF font. */}
      <a-entity position={`0 ${yOffset} 0`} text={`value: ${props.label}; color: ${props.color}; align: center; width: 6`} />
      <a-entity geometry='primitive: sphere; radius:0.3;' material={`color: ${props.color}; opacity: 1; roughness: 0.8`} href={props.href}></a-entity>
      <a-entity geometry='primitive: sphere' class='highlight' visible='false' radius='0.35' material='color: #0000ff; opacity: 0.6; roughness: 1; metalness: 0.5;'></a-entity>
      <a-entity geometry='primitive: box;' id='shadow' position='0 -1 0' material='color: #999; opacity: 1;' scale='0.4 1 0.4'></a-entity>
    </a-entity>
  );
}
