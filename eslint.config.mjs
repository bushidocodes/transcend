import neostandard from 'neostandard';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';

// Flat-config replacement for the legacy .eslintrc + babel-eslint stack. neostandard is the
// maintained successor to eslint-config-standard; its `semi: true` keeps the codebase's
// existing "standard style, but with semicolons" convention. The default espree parser handles
// the modern syntax (optional catch binding, etc.) that previously required babel-eslint.
export default [
  {
    // public/** is build output; aframe-minecraft.js is a vendored THREEx port kept in its
    // upstream style (tabs, THREEx self-reference, lowercase constructors).
    ignores: ['public/**', '.playwright-mcp/**', 'browser/aframeComponents/aframe-minecraft.js'],
  },

  ...neostandard({ semi: true }),

  // React/JSX: enable JSX parsing and the two rules the old config relied on to keep
  // `React` and JSX-referenced components from tripping no-unused-vars.
  {
    files: ['browser/**/*.js'],
    plugins: { react: reactPlugin },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      // THREE/AFRAME are runtime globals provided by A-Frame in the browser.
      globals: { ...globals.browser, THREE: 'readonly', AFRAME: 'readonly' },
    },
    rules: {
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
    },
  },

  // Server and db code runs in Node.
  {
    files: ['server/**/*.js', 'db/**/*.js', 'build.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Test files use Vitest's globals (test.globals in vitest.config.mjs). toEqualImmutable is a
  // custom matcher registered in test/setup.js.
  {
    files: ['**/*.test.js', '**/*.test.jsx'],
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
