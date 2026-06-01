import React from 'react';
import '../../aframeComponents/aframe-hyperlink';

export default function Teleporter (props) {
  // Requires: x, y, z, rotation, label
  const xOffset = props.labelx || 0;
  const yOffset = props.labely || 0;
  const zOffset = props.labelz || 0;
  const rotation = props.rotation || 0;

  return (
    <a-entity position={`${props.x} ${props.y} ${props.z}`} rotation={`0 ${rotation} 0`} >
      {/* Built-in text needs an SDF/MSDF font, not the three.js typeface.json used pre-1.x.
          Omitting `font` falls back to A-Frame's bundled `roboto` SDF font. */}
      <a-entity position={`${xOffset} ${yOffset} ${zOffset}`} text={`value: ${props.label}; color: ${props.color}; align: center; width: 6`} />
      <a-entity geometry="primitive: sphere; radius:0.3;" material={`color: ${props.color}; opacity: 1; roughness: 0.8`} href={props.href}></a-entity>
      <a-entity geometry="primitive: sphere" class="highlight" visible="false" radius="0.35" material="color: #0000ff; opacity: 0.6; roughness: 1; metalness: 0.5;"></a-entity>
      <a-entity geometry="primitive: box;" id="shadow" position="0 -1 0" material="color: #999; opacity: 1;" scale="0.4 1 0.4"></a-entity>
    </a-entity>
  );
}
