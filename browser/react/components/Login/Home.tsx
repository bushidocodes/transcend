import type { FormEvent } from 'react';
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
}

export default function Home () {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  function handleLogin (event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.target as HTMLFormElement & { email: HTMLInputElement; password: HTMLInputElement };
    const email = form.email.value;
    const password = form.password.value;
    dispatch(login(email, password)).then(() => navigate('/vr'));
  }

  function handleSignup (event: FormEvent<HTMLFormElement>) {
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
    dispatch(signup(name, displayName, email, password)).then(() => navigate('/vr'));
  }

  return (
    <div>
      <Title styles={styles} />
      <Outlet context={{ login: handleLogin, signup: handleSignup, styles } satisfies LoginOutletContext} />
    </div>
  );
}
