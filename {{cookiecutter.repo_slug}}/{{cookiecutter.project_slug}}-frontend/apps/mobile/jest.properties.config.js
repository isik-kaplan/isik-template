/**
 * The second suite: every test here states a claim over generated input, and the whole set would reach
 * the app on its own if `__tests__/` did not exist. Its own coverage, gated at 100%.
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['<rootDir>/properties/**/*.property.ts?(x)'],
  setupFiles: ['<rootDir>/properties/setup.ts'],
  // Each test is 25 examples rather than one.
  testTimeout: 120000,
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'theme/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/__tests__/**',
  ],
  coverageDirectory: 'coverage-properties',
  coverageReporters: ['text', 'json-summary'],
  // Every branch too: a property picks the case it tests and draws only its inputs, so no run misses one.
  coverageThreshold: { global: { lines: 100, functions: 100, branches: 100, statements: 100 } },
}
