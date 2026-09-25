import AuthenticatedLayout from '@/app/(authenticated)/_layout'

import { render, screen } from '@testing-library/react-native'

const mockUseAuthenticated = jest.fn()
jest.mock('@/lib/useAuthenticated', () => ({ useAuthenticated: () => mockUseAuthenticated() }))

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
    Slot: () => <Text testID="slot" />,
  }
})

describe('AuthenticatedLayout', () => {
  it('shows a loading indicator while the auth check is in flight', async () => {
    mockUseAuthenticated.mockReturnValue(null)
    await render(<AuthenticatedLayout />)
    expect(screen.getByTestId('loading-indicator')).toBeTruthy()
    expect(screen.getByTestId('loading-container').props.style).toEqual({
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    })
  })

  it('redirects to login when not authenticated', async () => {
    mockUseAuthenticated.mockReturnValue(false)
    await render(<AuthenticatedLayout />)
    expect(screen.getByTestId('redirect').props.children).toBe('/login')
  })

  it('renders the nested route when authenticated', async () => {
    mockUseAuthenticated.mockReturnValue(true)
    await render(<AuthenticatedLayout />)
    expect(screen.getByTestId('slot')).toBeTruthy()
  })
})
