// Ambient types for the A-Frame runtime. A-Frame 1.x ships no type declarations and its
// component/THREE surface is far larger than what this app touches, so the pragmatic contract
// is: the modules exist (imported for their side effects) and the globals they install are
// `any`. Component schemas/data get typed at the component definitions instead.
//
// NOTE: this file must stay a global script (no top-level import/export) — the shorthand
// `declare module` form and the bare global declarations only work in script files.

declare module 'aframe';
declare module 'aframe-gif-shader';

// Installed on window by the aframe import; also listed as ESLint globals.
declare var AFRAME: any; // eslint-disable-line no-var
declare var THREE: any; // eslint-disable-line no-var
