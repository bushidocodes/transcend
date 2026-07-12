import { useOutletContext } from 'react-router';
import type { LoginOutletContext } from './Home.tsx';

export default function Signup() {
  const { signup, styles, signupError } = useOutletContext<LoginOutletContext>();

  return (
    <div style={styles.signUpContainer}>
      <form onSubmit={signup}>
        {/* Assertive live region so screen readers announce auth failures (issue #228). */}
        <div role="alert" aria-live="assertive" style={styles.errorMessage}>
          {signupError || ''}
        </div>
        <div>
          <input
            key="name"
            name="name"
            placeholder="name"
            aria-label="name"
            style={styles.formControl}
            required
          />
        </div>
        <div>
          <input
            key="displayName"
            name="displayName"
            placeholder="display name"
            aria-label="display name"
            maxLength={8}
            style={styles.formControl}
            required
          />
        </div>
        <div>
          <input
            key="email"
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
          Sign Up
        </button>
      </form>
    </div>
  );
}
