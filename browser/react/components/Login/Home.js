import React from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useDispatch } from 'react-redux';
import { login, signup } from '../../../redux/reducers/auth';
import styles from './styles';
import Title from './Title';

export default function Home () {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  function handleLogin (event) {
    event.preventDefault();
    const email = event.target.email.value;
    const password = event.target.password.value;
    dispatch(login(email, password)).then(() => navigate('/vr'));
  }

  function handleSignup (event) {
    event.preventDefault();
    const name = event.target.name.value;
    const displayName = event.target.displayName.value;
    const email = event.target.email.value;
    const password = event.target.password.value;
    dispatch(signup(name, displayName, email, password)).then(() => navigate('/vr'));
  }

  return (
    <div>
      <Title styles={styles} />
      <Outlet context={{ login: handleLogin, signup: handleSignup, styles }} />
    </div>
  );
}
