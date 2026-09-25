/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // tsconfig.json's own "paths" only resolves @/ for type-checking (tsc, editors) - Jest needs its
  // own, separate mapping to actually resolve the alias at test-run time.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', '!**/__tests__/**'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
}
