import { sharedPlugins, sharedResolve } from './vitest.config.mts'
import { defineConfig } from 'vitest/config'

/**
 * The second suite: every test here states a claim over generated input, and the whole set would reach
 * the application on its own if `src/__tests__/` did not exist.
 *
 * The server/browser split is a directory glob rather than the hand-kept list `vitest.server-tests.ts`
 * is: this layout is the suite's own, so where a property lives declares its environment.
 */
export default defineConfig({
  plugins: sharedPlugins,
  resolve: sharedResolve,
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'properties:server', environment: 'node', include: ['properties/server/**/*.property.ts?(x)'] },
      },
      {
        extends: true,
        test: {
          name: 'properties:browser',
          environment: 'jsdom',
          include: ['properties/browser/**/*.property.ts?(x)'],
        },
      },
    ],
    globals: false,
    unstubGlobals: true,
    // Each test is 25 examples rather than one, and a sweep renders every route in each of them.
    testTimeout: 120_000,
    hookTimeout: 45_000,
    setupFiles: ['./properties/setup.ts'],
    env: { {{ cookiecutter.config_prefix }}__DOMAIN: 'test-project.test', {{ cookiecutter.config_prefix }}__OAUTH_PROVIDER__MODE: 'approval' },
    // Externalized, @isikk/core's own "next/server" import would bypass vi.mock().
    server: { deps: { inline: ['@isikk/core'] } },
    coverage: {
      provider: 'v8',
      // Named, not defaulted: a run reports only the files it loaded, so a suite that never imports a
      // module would read as 100% of what it did.
      include: ['src/**/*.{ts,tsx}'],
      // Every branch too: a property picks the case it tests and draws only its inputs, so no run misses one.
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
      // The example suite's own exclusions, and its test code, which isn't this suite's to cover.
      exclude: ['src/**/*.d.ts', 'src/__tests__/**', 'src/instrumentation*.ts', 'src/sentry.*.config.ts'],
      reportsDirectory: 'coverage-properties',
      reporter: ['text', 'json-summary'],
    },
  },
})
