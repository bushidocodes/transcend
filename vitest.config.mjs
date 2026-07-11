import { defineConfig } from 'vitest/config';

// Vitest replaces the old mocha + chai + chai-immutable + esbuild-register stack. It uses esbuild
// under the hood (same as build.mjs), so JSX/ESM/CJS all transform without extra config.
export default defineConfig({
  test: {
    // Provide describe/it/expect/beforeAll/etc. as globals so the CommonJS test files don't need
    // to import them (mirrors the old mocha setup).
    globals: true,
    environment: 'node',
    env: { NODE_ENV: 'testing' },
    include: [
      'browser/**/*.test.{js,jsx}',
      'db/**/*.test.js',
      'server/**/*.test.js',
      'shared/**/*.test.js',
    ],
    setupFiles: ['./test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['browser/**', 'server/**', 'db/**', 'shared/**'],
      exclude: ['**/*.test.*', 'browser/aframeComponents/aframe-minecraft.js'],
    },
  },
});
