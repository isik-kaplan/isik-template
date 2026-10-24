import { SERVER_TEST_FILES } from './vitest.server-tests'
import react from '@vitejs/plugin-react'
import { statSync } from 'fs'
import path from 'path'
import { configDefaults, defineConfig } from 'vitest/config'
import { BaseSequencer, type TestSpecification } from 'vitest/node'

// Smallest test files first: a mutant usually dies to its own file's unit test, and run last that
// test can outlast Stryker's timeout, counting the mutant alive.
class NarrowestFirst extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    const size = (file: TestSpecification) => statSync(file.moduleId).size
    return [...files].sort((a, b) => size(a) - size(b) || a.moduleId.localeCompare(b.moduleId))
  }
}

// Everything but the environment; exported for `scripts/server-test-candidates.mjs`.
export const sharedPlugins = [react()]

export const sharedResolve = { alias: { '@': path.resolve(__dirname, './src') } }

export default defineConfig({
  plugins: sharedPlugins,
  test: {
    // Two environments: jsdom hands server code globals production never has (vitest.server-tests.ts).
    projects: [
      { extends: true, test: { name: 'server', environment: 'node', include: SERVER_TEST_FILES } },
      // `exclude` replaces the default rather than adding to it, so the default is carried over.
      {
        extends: true,
        test: { name: 'browser', environment: 'jsdom', exclude: [...configDefaults.exclude, ...SERVER_TEST_FILES] },
      },
    ],
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    // fast-check's test.prop renders many cases in one test; 5s leaves no headroom on a loaded runner.
    testTimeout: 15_000,
    sequence: { sequencer: NarrowestFirst },
    // Externalized, @isikk/core's own "next/server" import would bypass vi.mock().
    server: { deps: { inline: ['@isikk/core'] } },
    coverage: {
      provider: 'v8',
      // `all`, so a file no test imports shows as 0% rather than vanishing.
      all: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts', 'src/__tests__/**'],
      // No threshold: packages/mutation-check/check-coverage.mjs enforces it against coverage-exemptions.json.
      reporter: ['text', 'html', 'json'],
    },
  },
  resolve: sharedResolve,
})
