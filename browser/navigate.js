// Exposes React Router's navigate() function to non-React code (A-Frame components).
// Call setNavigateFn() once from inside the router tree; call navigateTo() from anywhere.
let _navigate = null;

export function setNavigateFn (fn) {
  _navigate = fn;
}

export function navigateTo (path) {
  if (_navigate) _navigate(path);
}
