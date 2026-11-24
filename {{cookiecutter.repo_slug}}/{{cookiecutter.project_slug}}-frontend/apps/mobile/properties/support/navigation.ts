// What expo-router's `router` does here: spies, so a property reads where a screen sent the person.
export const navigation = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  canGoBack: jest.fn(() => false),
}

// What useLocalSearchParams answers: the params a property routes a screen with.
export const routeParams: { current: Record<string, string | undefined> } = { current: {} }

// What useSegments answers: the route a property puts a layout on.
export const routeSegments: { current: string[] } = { current: [] }

export function forgetNavigation() {
  for (const spy of Object.values(navigation)) spy.mockClear()
  routeParams.current = {}
  routeSegments.current = []
}
