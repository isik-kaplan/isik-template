/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Absolute paths: Stryker loads the environment itself, without <rootDir>.
  testEnvironment: require.resolve('./jest/StopAtFirstKillEnvironment.js'),
  testSequencer: require.resolve('./jest/NarrowestFirstSequencer.js'),
  // Added to jest-expo's own setup files, not in place of them.
  setupFiles: [require.resolve('./jest/passwordsSignIn.js')],
  // The property suite has its own config and coverage (jest.properties.config.js).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/properties/'],
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
