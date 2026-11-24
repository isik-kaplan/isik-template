// Native modules with no JS fallback, mocked once for both suites. Add the next one here, not per test.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
