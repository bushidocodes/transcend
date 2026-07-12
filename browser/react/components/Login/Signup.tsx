import { useOutletContext } from 'react-router';
import type { LoginOutletContext } from './Home.tsx';

export default function Signup () {
  const { signup, styles } = useOutletContext<LoginOutletContext>();

  return (
    <div style={styles.signUpContainer}>
      <form onSubmit={signup}>
        <div>
          <input
            key="name"
            name="name"
            placeholder="name"
            style={styles.formControl}
            required
          />
        </div>
        <div>
          <input
            key="displayName"
            name="displayName"
            placeholder="display name"
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
        <button style={styles.loginButton} type="submit">Sign Up</button>
      </form>
    </div>
  );
}
