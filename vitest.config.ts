import { defineConfig } from 'vitest/config';

// Vitest replaces the old mocha + chai + chai-immutable + esbuild-register stack. It uses esbuild
// under the hood (same as build.ts), so TS/TSX/ESM all transform without extra config.
export default defineConfig({
  test: {
    // Provide describe/it/expect/beforeAll/etc. as globals so test files don't need
    // to import them (mirrors the old mocha setup). Typed via "vitest/globals" in tsconfig.
    globals: true,
    environment: 'node',
    env: { NODE_ENV: 'testing' },
    include: [
      'browser/**/*.test.{ts,tsx}',
      'db/**/*.test.ts',
      'server/**/*.test.ts',
      'shared/**/*.test.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['browser/**', 'server/**', 'db/**', 'shared/**'],
      exclude: ['**/*.test.*', 'browser/aframeComponents/aframe-minecraft.ts']
    }
  }
});
