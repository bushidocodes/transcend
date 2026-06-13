import '../three-compat'; // restore THREE.Math alias for aframe-gif-shader; must run before it loads
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import store from '../redux/store';
import App from './components/App';
import Sean from './components/Sean';
import Beth from './components/Beth';
import Yoonah from './components/Yoonah';
import Joey from './components/Joey';
import Lobby from './components/Lobby';
import ChangingRoom from './components/ChangingRoom';
import Home from './components/Login/Home';
import Login from './components/Login/Login';
import Signup from './components/Login/Signup';
// Importing for its side effects: registering the A-Frame components that socket.js pulls in.
// The socket itself is created lazily by <App> after login (issue #67), not at import time.
import '../socket';
import { whoami, logout } from '../redux/reducers/auth';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { setNavigateFn } from '../navigate';

const theme = createTheme();

// Hide the pre-bundle loading placeholder once React takes over
const prebundle = document.getElementById('prebundleContent');
if (prebundle) prebundle.style.display = 'none';

// Guards the /vr subtree. On a hard refresh the Redux store is empty, so we
// dispatch whoami() once to rehydrate auth from the server session cookie.
function RequireAuth ({ children }) {
  const auth = useSelector(state => state.auth);
  const dispatch = useDispatch();
  const alreadyAuthed = auth.has('id');
  const [loading, setLoading] = useState(!alreadyAuthed);

  useEffect(() => {
    if (!alreadyAuthed) {
      dispatch(whoami()).then(() => setLoading(false));
    }
  }, []);

  if (loading) return null;
  if (!auth.has('id')) return <Navigate to="/" replace />;
  return children;
}

// Populates the module-level navigate shim used by A-Frame components (aframe-hyperlink.js).
function NavigateCapture () {
  const navigate = useNavigate();
  useEffect(() => { setNavigateFn(navigate); }, [navigate]);
  return null;
}

// Handles the /logout route: tears down the avatar, dispatches logout, then redirects home.
function Logout () {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    // The socket only exists if the user reached the VR section and <App> initialized it.
    // Guard the emit so logging out from a state where it was never created can't throw.
    if (window.socket) window.socket.emit('logoutUser');
    dispatch(logout()).then(() => navigate('/', { replace: true }));
  }, []);

  return null;
}

createRoot(document.getElementById('react-app')).render(
  <Provider store={store}>
    <ThemeProvider theme={theme}>
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

          {/* VR section — RequireAuth checks session before rendering App */}
          <Route path="/vr" element={<RequireAuth><App /></RequireAuth>}>
            <Route index element={<Navigate to="lobby" replace />} />
            <Route path="lobby" element={<Lobby />} />
            <Route path="thebasement" element={<Sean />} />
            <Route path="spaceroom" element={<Beth />} />
            <Route path="catroom" element={<Yoonah />} />
            <Route path="gameroom" element={<Joey />} />
            <Route path="thegap" element={<ChangingRoom />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </Provider>
);
