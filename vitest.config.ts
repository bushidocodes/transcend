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
      // Gate on server/db/shared where unit tests are tractable (issue #235). Browser A-Frame
      // and the full WebRTC client stay out of the threshold base so the gate is meaningful
      // rather than a vanity number depressed by hard-to-mock UI.
      include: ['server/**', 'db/**', 'shared/**', 'browser/webRTC/peer-guards.ts'],
      exclude: [
        '**/*.test.*',
        'browser/aframeComponents/aframe-minecraft.ts',
        // Full process bootstrap (helmet/session wiring) is integration-heavy; seed/migrate-cli
        // are one-shot scripts. Keep them out of the threshold denominator.
        'server/index.ts',
        'db/seed.ts',
        'db/migrate-cli.ts'
      ],
      // Modest floors that currently pass at master (~47% overall; higher on the scoped set).
      // Bump deliberately as more pure logic is covered — never lower without an issue.
      thresholds: {
        lines: 55,
        functions: 50,
        branches: 50,
        statements: 55
      }
    }
  }
});
