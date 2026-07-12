import { useState, type FormEvent } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { login, signup } from '../../../redux/reducers/auth.ts';
import type { AppDispatch } from '../../../redux/store.ts';
import styles from './styles/index.ts';
import Title from './Title.tsx';

// Shape of the Outlet context Home provides to the Login / Signup child routes.
export interface LoginOutletContext {
  login: (event: FormEvent<HTMLFormElement>) => void;
  signup: (event: FormEvent<HTMLFormElement>) => void;
  styles: typeof styles;
  /** Login-form failure message; null when none (issue #228). Not shared with signup. */
  loginError: string | null;
  /** Signup-form failure message; null when none (issue #228). Not shared with login. */
  signupError: string | null;
}

export default function Home() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  // Separate form errors so a failed login does not appear above signup (and vice versa).
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.target as HTMLFormElement & {
      email: HTMLInputElement;
      password: HTMLInputElement;
    };
    const email = form.email.value;
    const password = form.password.value;
    setLoginError(null);
    // Only navigate on success; surface failure so the user is not silently bounced (#228).
    dispatch(login(email, password)).then(ok => {
      if (ok) navigate('/vr');
      else setLoginError('Login failed. Check your email and password.');
    });
  }

  function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.target as HTMLFormElement & {
      name: HTMLInputElement;
      displayName: HTMLInputElement;
      email: HTMLInputElement;
      password: HTMLInputElement;
    };
    const name = form.name.value;
    const displayName = form.displayName.value;
    const email = form.email.value;
    const password = form.password.value;
    setSignupError(null);
    dispatch(signup(name, displayName, email, password)).then(ok => {
      if (ok) navigate('/vr');
      else
        setSignupError('Signup failed. That email may already be in use, or the form is invalid.');
    });
  }

  return (
    <div>
      <Title styles={styles} />
      <Outlet
        context={
          {
            login: handleLogin,
            signup: handleSignup,
            styles,
            loginError,
            signupError
          } satisfies LoginOutletContext
        }
      />
    </div>
  );
}
