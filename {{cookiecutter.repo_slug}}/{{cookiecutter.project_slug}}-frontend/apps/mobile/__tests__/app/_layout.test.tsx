import RootLayout from '@/app/_layout'

import { render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    Stack: ({ screenOptions }: { screenOptions: unknown }) => (
      <Text testID="stack">{JSON.stringify(screenOptions)}</Text>
    ),
  }
})
jest.mock('expo-status-bar', () => {
  const { Text } = jest.requireActual('react-native')
  return { StatusBar: () => <Text testID="status-bar" /> }
})

describe('RootLayout', () => {
  it('renders the status bar and the route stack, hiding the default header', async () => {
    await render(<RootLayout />)
    expect(screen.getByTestId('status-bar')).toBeTruthy()
    expect(screen.getByTestId('stack').props.children).toBe(JSON.stringify({ headerShown: false }))
  })
})
