import Index from '@/app/index'

import { render, screen } from '@testing-library/react-native'

const mockUseAuthenticated = jest.fn()
jest.mock('@/lib/useAuthenticated', () => ({ useAuthenticated: () => mockUseAuthenticated() }))

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return { Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text> }
})

describe('Index', () => {
  it('shows a loading indicator while the auth check is in flight', async () => {
    mockUseAuthenticated.mockReturnValue(null)
    await render(<Index />)
    expect(screen.getByTestId('loading-indicator')).toBeTruthy()
    expect(screen.getByTestId('loading-container').props.style).toEqual({
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    })
  })

  it('redirects to the authenticated home when logged in', async () => {
    mockUseAuthenticated.mockReturnValue(true)
    await render(<Index />)
    expect(screen.getByTestId('redirect').props.children).toBe('/(authenticated)/home')
  })

  it('redirects to login when not logged in', async () => {
    mockUseAuthenticated.mockReturnValue(false)
    await render(<Index />)
    expect(screen.getByTestId('redirect').props.children).toBe('/login')
  })
})
