// The skin catalog, defined once and imported by BOTH sides (issue #119): the server's
// validator (server/validSkins.ts derives its whitelist Set from this) and the ChangingRoom
// mannequins (browser/react/components/ChangingRoom.tsx renders one mannequin per entry, in
// this order). Before this module the two lists were maintained by hand in both places and
// could drift — a skin on a mannequin the server rejects, or a server-accepted skin no
// mannequin offers.
//
// `id` is the basename of a file in public/images/ and is interpolated into an A-Frame
// `skinUrl: ../../images/${id}.png` component string rendered on EVERY client, so the server
// must only ever accept ids from this list (issue #79 — path traversal / component injection).
// `label` is the nameplate shown over the mannequin.

export interface Skin {
  id: string;
  label: string;
}

export const SKINS: readonly Skin[] = [
  { id: '3djesus', label: '3D Jesus' },
  { id: 'agentsmith', label: 'Agent Smith' },
  { id: 'batman', label: 'Batman' },
  { id: 'char', label: 'Minecraft' },
  { id: 'god', label: 'God' },
  { id: 'Iron-Man-Minecraft-Skin', label: 'Iron Man' },
  { id: 'jetienne', label: 'Jetienne' },
  { id: 'Joker', label: 'Joker' },
  { id: 'Mario', label: 'Mario' },
  { id: 'martialartist', label: 'Martial Artist' },
  { id: 'robocop', label: 'Robocop' },
  { id: 'Sonicthehedgehog', label: 'Sonic' },
  { id: 'woody', label: 'woody' },
  { id: 'powerRanger', label: 'Power Ranger' },
  { id: 'catwoman', label: 'Catwoman' },
  { id: 'blackWidow', label: 'Black Widow' },
  { id: 'evilQueen', label: 'Evil Queen' },
  { id: 'graceHopper', label: 'Grace Hopper' },
  { id: 'princessBelle', label: 'Princess Belle' },
  { id: 'skaterGirl', label: 'Skater Girl' },
  { id: 'katnissEverdeen', label: 'Katniss Everdeen' },
  { id: 'theflash', label: 'theflash' },
  { id: 'Superman', label: 'Superman' },
  { id: 'Spiderman', label: 'Spiderman' }
];
