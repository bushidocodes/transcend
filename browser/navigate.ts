// Exposes React Router's navigate() function to non-React code (A-Frame components).
// Call setNavigateFn() once from inside the router tree; call navigateTo() from anywhere.
let _navigate: ((path: string) => void) | null = null;

export function setNavigateFn (fn: (path: string) => void): void {
  _navigate = fn;
}

export function navigateTo (path: string): void {
  if (_navigate) _navigate(path);
}

// THE path→room derivation (issue #119). The wire name of the room at `pathname` — the scene
// sent in joinScene/changeScene and the WebRTC chat-room key — or null when no actual room is
// selected (the bare /vr index while it redirects, the login pages). Every call site must use
// this one helper: it used to be re-implemented at each site, and if two copies disagree a
// client's avatar scene and its audio room diverge — you can hear people you can't see.
//
// The wire name is the path segments concatenated ('/vr/lobby' → 'vrlobby'), preserving the
// room names deployed clients already use.
export function currentRoom (pathname: string = window.location.pathname): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  return segments.join('');
}
