import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
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
      thresholds: { 100: true },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
