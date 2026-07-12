import type { CSSProperties } from 'react';

// Inline brand marks (issue #142): these two glyphs were the only reason the app depended on
// font-awesome (a 1.4 MB webfont served whole for `fa-google` / `fa-github`). Rendering them as
// inline SVG drops that dependency and the webfont download. `fill: currentColor` inherits the
// parent link's white color, matching how the old font glyphs picked up `color`.

// GitHub "Octocat" mark (octicons mark-github, 16px viewBox).
export const GITHUB_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z';
export const GITHUB_VIEWBOX = '0 0 16 16';

// Google "G" mark (single-path monochrome form, 24px viewBox).
export const GOOGLE_PATH = 'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z';
export const GOOGLE_VIEWBOX = '0 0 24 24';

interface Props {
  path: string;
  viewBox: string;
  label: string;
  style?: CSSProperties;
}

// Renders one brand mark inside the caller's badge-style wrapper (the same style object that
// used to size the font glyph — float, fixed box, right border), with the SVG centered in it.
export default function BrandIcon ({ path, viewBox, label, style }: Props) {
  return (
    <span style={style}>
      <svg
        viewBox={viewBox}
        width='21'
        height='21'
        fill='currentColor'
        role='img'
        aria-label={label}
        style={{ display: 'block', margin: '0 auto' }}
      >
        <path d={path} />
      </svg>
    </span>
  );
}
