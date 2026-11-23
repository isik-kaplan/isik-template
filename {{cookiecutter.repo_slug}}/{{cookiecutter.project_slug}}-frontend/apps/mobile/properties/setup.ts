import fc from 'fast-check'

// 25 runs for a developer and for CI alike: a number that differs between the two is one nobody can
// reason about, and a counterexample found only in a deeper run is one the gate never had.
fc.configureGlobal({ numRuns: 25 })

process.env.EXPO_PUBLIC_AUTH_ORIGIN = 'http://auth.test-project.test'
process.env.EXPO_PUBLIC_API_ORIGIN = 'http://api.test-project.test'
// Whatever the build holds; a property without passwords sets it to 'true' itself.
process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY = 'false'

// Each property resets these itself, at the top of its predicate: a hook would run once for all 25 examples.
jest.mock('expo-router', () => {
  const { navigation, routeParams } = jest.requireActual('./support/navigation')
  const { createElement } = jest.requireActual('react')
  const { Text } = jest.requireActual('react-native')
  // Each stands in by saying where it would go, so a property reads the destination off the screen.
  const named = (testID: string) => (props: { href?: unknown; children?: unknown; testID?: string }) =>
    createElement(Text, { testID: props.testID ?? testID, accessibilityHint: String(props.href ?? '') }, props.children)
  return {
    router: navigation,
    useLocalSearchParams: () => routeParams.current,
    Link: named('link'),
    Redirect: named('redirect'),
    Slot: named('slot'),
    Stack: named('stack'),
  }
})

jest.mock('expo-secure-store', () => jest.requireActual('./support/store').secureStore)

jest.mock('expo-notifications', () => ({
  useLastNotificationResponse: () => null,
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getDevicePushTokenAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}))
