import neostandard from 'neostandard';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';

// Flat-config replacement for the legacy .eslintrc + babel-eslint stack. neostandard is the
// maintained successor to eslint-config-standard; its `semi: true` keeps the codebase's
// existing "standard style, but with semicolons" convention. `ts: true` swaps in
// typescript-eslint's parser and TS-aware rules for the converted .ts/.tsx sources.
//
// ESLint 10 (#155): published neostandard@0.13 peers only ESLint 9 and ships @stylistic@2,
// which crashes on ESLint 10 (sourceCode.isSpaceBetweenTokens). Until neostandard 0.14 lands
// (upstream PR neostandard/neostandard#340), we pin that PR's commit for ESLint 10 + @stylistic@5.
export default [
  {
    // public/** is build output; aframe-minecraft.ts is a vendored THREEx port kept in its
    // upstream style (tabs, THREEx self-reference, lowercase constructors).
    ignores: [
      'public/**',
      '.playwright-mcp/**',
      '.claude/**',
      '.issue-review/**',
      'coverage/**',
      'browser/aframeComponents/aframe-minecraft.ts',
    ],
  },

  ...neostandard({ semi: true, ts: true }),

  // React/JSX: enable the rules that keep JSX-referenced components from tripping
  // no-unused-vars.
  {
    files: ['browser/**/*.{ts,tsx}'],
    plugins: { react: reactPlugin },
    languageOptions: {
      // THREE/AFRAME are runtime globals provided by A-Frame in the browser.
      globals: { ...globals.browser, THREE: 'readonly', AFRAME: 'readonly' },
    },
    rules: {
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      // neostandard's prefer-single only started matching once JSX moved into .tsx files
      // (it targets **/*.{jsx,tsx}; the JSX used to live in .js). Keep the double quotes
      // the components were always written with.
      '@stylistic/jsx-quotes': ['error', 'prefer-double'],
    },
  },

  // Server and db code runs in Node. shared/ is consumed by both the server and the
  // browser bundle, so it lints as Node too.
  {
    files: ['server/**/*.ts', 'db/**/*.ts', 'shared/**/*.ts', 'migrations/**/*.ts', 'build.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Test files use Vitest's globals (test.globals in vitest.config.ts).
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
  },

  // Preserve the prior config's leniency on these two so they nudge rather than block.
  {
    rules: {
      'no-var': 'warn',
      'prefer-const': 'warn',
    },
  },
];
