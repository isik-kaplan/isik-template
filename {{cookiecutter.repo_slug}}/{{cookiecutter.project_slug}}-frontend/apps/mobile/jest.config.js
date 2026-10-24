/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Absolute paths: Stryker loads the environment itself, without <rootDir>.
  testEnvironment: require.resolve('./jest/StopAtFirstKillEnvironment.js'),
  testSequencer: require.resolve('./jest/NarrowestFirstSequencer.js'),
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'theme/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/__tests__/**',
  ],
  // No threshold: check-coverage.mjs reads the 'json' report against coverage-exemptions.json.
  coverageReporters: ['text', 'html', 'json'],
}
