import BrandIcon, { GITHUB_PATH, GITHUB_VIEWBOX } from './BrandIcon.tsx';
import type { LoginStyles } from './styles/index.ts';

/* ----------------- COMPONENT ------------------ */

interface Props {
  styles: LoginStyles;
}

export default (props: Props) => (
  <div style={props.styles.aboutContainer}>
    <h1 style={props.styles.appTitle}>Transcend</h1>
    <div style={props.styles.subtitleCenter}> Virtual Teams </div>
    <div style={props.styles.subtitleCenter}> Shared VR Experiences </div>
    <div style={props.styles.subtitleCenter}> Real Friends </div>
    <a
      target="_blank"
      href="https://github.com/TranscendVR/transcend"
      style={props.styles.viewOnGitHub}
      rel="noopener"
    >
      <BrandIcon
        path={GITHUB_PATH}
        viewBox={GITHUB_VIEWBOX}
        label="GitHub"
        style={props.styles.viewOnGitHubIcon}
      />
      View on GitHub
    </a>
  </div>
);
