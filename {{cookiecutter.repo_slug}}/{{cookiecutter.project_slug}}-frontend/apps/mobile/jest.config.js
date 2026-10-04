/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // tsconfig.json's own "paths" only resolves @/ for type-checking (tsc, editors) - Jest needs its
  // own, separate mapping to actually resolve the alias at test-run time.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'theme/**/*.{ts,tsx}',
    '!**/__tests__/**',
  ],
  // Enforced by packages/mutation-check/check-coverage.mjs instead of a threshold here - it reads
  // this same coverage-final.json ('json' reporter, below) and allows only the gaps
  // coverage-exemptions.json documents, rather than failing outright on any gap at all.
  coverageReporters: ['text', 'html', 'json'],
}
