import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';

export default function Login () {
  const { login, styles } = useOutletContext();

  return (
    <div style={styles.container}>
      <div>
        <Link to="/signup" style={styles.signupLink}>
          <button key="signup" style={styles.signupButton}>Sign Up</button>
        </Link>
      </div>
      <div style={styles.orDividerLineDiv}>
        <div style={styles.orDividerLineBefore}></div>
        <p style={styles.orDivider}>or</p>
        <div style={styles.orDividerLineAfter}></div>
      </div>
      <form onSubmit={login}>
        <div>
          <input
            key="name"
            name="email"
            type="email"
            placeholder="email"
            style={styles.formControl}
            required
          />
        </div>
        <div>
          <input
            key="password"
            name="password"
            type="password"
            placeholder="password"
            style={styles.formControl}
            required
          />
        </div>
        <button style={styles.loginButton} type="submit">Log In</button>
      </form>
      <div style={styles.orDividerLineDiv}>
        <div style={styles.orDividerLineBefore}></div>
        <p style={styles.orDivider}>or</p>
        <div style={styles.orDividerLineAfter}></div>
      </div>
      <div>
        <a target="_self" href="/api/auth/google/login" style={styles.loginWithGoogle}>
          <span className="fa fa-google" style={styles.loginWithGoogleIcon}></span>
          Log in with Google
        </a>
      </div>
    </div>
  );
}
