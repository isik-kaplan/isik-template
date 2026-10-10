import { SERVER_TEST_FILES } from './vitest.server-tests'
import react from '@vitejs/plugin-react'
import { statSync } from 'fs'
import path from 'path'
import { configDefaults, defineConfig } from 'vitest/config'
import { BaseSequencer, type TestSpecification } from 'vitest/node'

// The narrowest test files first, by size and then by path, whatever the last run's cache says. A
// mutant usually dies to the small unit test of the file it is in, and Stryker stops at the first
// failure - left to run last, that test only kills it after the whole suite, which can outlast
// Stryker's timeout and be counted alive.
class NarrowestFirst extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    const size = (file: TestSpecification) => statSync(file.moduleId).size
    return [...files].sort((a, b) => size(a) - size(b) || a.moduleId.localeCompare(b.moduleId))
  }
}

// Everything a run needs that is not about *which* environment it runs in. Exported so
// `scripts/server-test-candidates.mjs` runs the same suite under `node` without copying it.
export const sharedPlugins = [react()]

export const sharedResolve = { alias: { '@': path.resolve(__dirname, './src') } }

export default defineConfig({
  plugins: sharedPlugins,
  test: {
    // Two environments, because jsdom hands server code ambient globals production never has - see
    // vitest.server-tests.ts for what is on that list and why it is a list.
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
    // fast-check's test.prop renders a whole sample of cases in one test, not one render, so the
    // 5s default leaves no headroom on a loaded runner.
    testTimeout: 15_000,
    sequence: { sequencer: NarrowestFirst },
    // Otherwise @isikk/core is externalized and its own "next/server" import is resolved by
    // Node directly - bypassing vi.mock() entirely, which only intercepts Vite-transformed
    // imports. public.test.ts mocks next/server because next's package.json has no "exports"
    // map for that subpath, which only matters once it's no longer externalized.
    server: { deps: { inline: ['@isikk/core'] } },
    coverage: {
      provider: 'v8',
      // `all` so a file nothing imports in a test run still shows up as 0% instead of being
      // invisible to the report - the same thing `mutate`'s scope does for Stryker.
      all: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts', 'src/__tests__/**'],
      // Enforced by packages/mutation-check/check-coverage.mjs instead of a threshold here - it
      // reads this same coverage-final.json ('json' reporter, below) and allows only the gaps
      // coverage-exemptions.json documents, rather than failing outright on any gap at all.
      reporter: ['text', 'html', 'json'],
    },
  },
  resolve: sharedResolve,
})
