import RootLayout from '@/app/_layout'
import { palettes } from '@/theme'

import { render, screen, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }))
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
  return { StatusBar: ({ style }: { style: string }) => <Text testID="status-bar">{style}</Text> }
})

describe('RootLayout', () => {
  it.each([
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const)(
    'draws the %s choice kept on the phone, behind every route and under the status bar',
    async (kept, bar) => {
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(kept)
      await render(<RootLayout />)
      await waitFor(() => expect(screen.getByTestId('status-bar').props.children).toBe(bar))
      expect(screen.getByTestId('stack').props.children).toBe(
        JSON.stringify({ headerShown: false, contentStyle: { backgroundColor: palettes[kept].background } })
      )
    }
  )
})
