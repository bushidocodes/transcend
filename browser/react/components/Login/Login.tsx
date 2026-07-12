import { Link, useOutletContext } from 'react-router';
import BrandIcon, { GOOGLE_PATH, GOOGLE_VIEWBOX } from './BrandIcon.tsx';
import type { LoginOutletContext } from './Home.tsx';

export default function Login() {
  const { login, styles } = useOutletContext<LoginOutletContext>();

  return (
    <div style={styles.container}>
      <div>
        <Link to="/signup" style={styles.signupLink}>
          <button key="signup" style={styles.signupButton}>
            Sign Up
          </button>
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
            aria-label="email"
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
            aria-label="password"
            style={styles.formControl}
            required
          />
        </div>
        <button style={styles.loginButton} type="submit">
          Log In
        </button>
      </form>
      <div style={styles.orDividerLineDiv}>
        <div style={styles.orDividerLineBefore}></div>
        <p style={styles.orDivider}>or</p>
        <div style={styles.orDividerLineAfter}></div>
      </div>
      <div>
        <a target="_self" href="/api/auth/google/login" style={styles.loginWithGoogle}>
          <BrandIcon
            path={GOOGLE_PATH}
            viewBox={GOOGLE_VIEWBOX}
            label="Google"
            style={styles.loginWithGoogleIcon}
          />
          Log in with Google
        </a>
      </div>
    </div>
  );
}
