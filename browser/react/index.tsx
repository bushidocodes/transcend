import '../three-compat.ts'; // restore THREE.Math alias for aframe-gif-shader; must run before it loads
import { useState, useEffect, type ReactNode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router';
import store, { type RootState, type AppDispatch } from '../redux/store.ts';
import App from './components/App.tsx';
import Sean from './components/Sean.tsx';
import Beth from './components/Beth.tsx';
import Yoonah from './components/Yoonah.tsx';
import Joey from './components/Joey.tsx';
import Lobby from './components/Lobby.tsx';
import ChangingRoom from './components/ChangingRoom.tsx';
import Home from './components/Login/Home.tsx';
import Login from './components/Login/Login.tsx';
import Signup from './components/Login/Signup.tsx';
// Importing for its side effects: registering the A-Frame components that socket.ts pulls in.
// The socket itself is created lazily by <App> after login (issue #67), not at import time;
// getSocket() returns null until then.
import '../socket.ts';
import { getSocket } from '../socket-holder.ts';
import { whoami, logout } from '../redux/reducers/auth.ts';
import { EVENTS } from '../../shared/protocol.ts';
import { setNavigateFn } from '../navigate.ts';
import { ROOMS, DEFAULT_ROOM } from '../rooms.ts';

// Which component renders each room in the manifest (browser/rooms.ts). The manifest is pure
// data (see its header for why), so the component wiring lives here with the router — and the
// two lists are asserted in agreement at startup so they can't silently drift.
const ROOM_COMPONENTS: Record<string, ComponentType> = {
  lobby: Lobby,
  thebasement: Sean,
  spaceroom: Beth,
  catroom: Yoonah,
  gameroom: Joey,
  thegap: ChangingRoom
};
ROOMS.forEach(({ path }) => {
  if (!ROOM_COMPONENTS[path]) throw new Error(`Room '${path}' is in the manifest but has no component`);
});
Object.keys(ROOM_COMPONENTS).forEach(path => {
  if (!ROOMS.some(room => room.path === path)) throw new Error(`Room component '${path}' is not in the manifest`);
});

// Hide the pre-bundle loading placeholder once React takes over
const prebundle = document.getElementById('prebundleContent');
if (prebundle) prebundle.style.display = 'none';

// Guards the /vr subtree. On a hard refresh the Redux store is empty, so we
// dispatch whoami() once to rehydrate auth from the server session cookie.
function RequireAuth ({ children }: { children: ReactNode }) {
  const auth = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch<AppDispatch>();
  const alreadyAuthed = auth.id != null;
  const [loading, setLoading] = useState(!alreadyAuthed);

  useEffect(() => {
    if (!alreadyAuthed) {
      dispatch(whoami()).then(() => setLoading(false));
    }
  }, []);

  if (loading) return null;
  if (auth.id == null) return <Navigate to="/" replace />;
  return children;
}

// Populates the module-level navigate shim used by A-Frame components (aframe-hyperlink.ts).
function NavigateCapture () {
  const navigate = useNavigate();
  useEffect(() => { setNavigateFn(navigate); }, [navigate]);
  return null;
}

// Handles the /logout route: tears down the avatar, dispatches logout, then redirects home.
function Logout () {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  useEffect(() => {
    // The socket only exists if the user reached the VR section and <App> initialized it.
    // Guard the emit so logging out from a state where it was never created can't throw.
    const socket = getSocket();
    if (socket) socket.emit(EVENTS.LOGOUT_USER);
    dispatch(logout()).then(() => navigate('/', { replace: true }));
  }, []);

  return null;
}

createRoot(document.getElementById('react-app')!).render(
  <Provider store={store}>
    <BrowserRouter>
      <NavigateCapture />
      <Routes>
        {/* Auth / login shell — Home provides title + Outlet context (login, signup, styles) */}
        <Route path="/" element={<Home />}>
          <Route index element={<Navigate to="/login" replace />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
        </Route>

        <Route path="/logout" element={<Logout />} />

        {/* VR section — RequireAuth checks session before rendering App. One route per
            manifest entry (issue #119). */}
        <Route path="/vr" element={<RequireAuth><App /></RequireAuth>}>
          <Route index element={<Navigate to={DEFAULT_ROOM} replace />} />
          {ROOMS.map(({ path }) => {
            const RoomComponent = ROOM_COMPONENTS[path];
            return <Route key={path} path={path} element={<RoomComponent />} />;
          })}
        </Route>
      </Routes>
    </BrowserRouter>
  </Provider>
);
