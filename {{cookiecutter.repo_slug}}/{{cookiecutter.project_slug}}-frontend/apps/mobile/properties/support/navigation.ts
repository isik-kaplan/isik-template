// What expo-router's `router` does here: spies, so a property reads where a screen sent the person.
export const navigation = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  canGoBack: jest.fn(() => false),
}

export function forgetNavigation() {
  for (const spy of Object.values(navigation)) spy.mockClear()
}
