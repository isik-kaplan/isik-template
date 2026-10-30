import AuthenticatedLayout from '@/app/(authenticated)/_layout'

import { render, screen } from '@testing-library/react-native'

const mockUseAuthenticated = jest.fn()
jest.mock('@/lib/useAuthenticated', () => ({ useAuthenticated: () => mockUseAuthenticated() }))

const mockRegisterForPush = jest.fn()
const mockShowPushesWhileOpen = jest.fn()
jest.mock('@/lib/push', () => ({
  registerForPush: () => mockRegisterForPush(),
  showPushesWhileOpen: () => mockShowPushesWhileOpen(),
}))

const mockLastResponse = jest.fn()
jest.mock('expo-notifications', () => ({ useLastNotificationResponse: () => mockLastResponse() }))

const mockPush = jest.fn()
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
    Slot: () => <Text testID="slot" />,
    router: { push: (...args: unknown[]) => mockPush(...args) },
  }
})

describe('AuthenticatedLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRegisterForPush.mockResolvedValue(undefined)
    mockLastResponse.mockReturnValue(null)
  })

  it('registers the phone for pushes, and shows them while open, once signed in', async () => {
    mockUseAuthenticated.mockReturnValue(true)
    await render(<AuthenticatedLayout />)
    expect(mockRegisterForPush).toHaveBeenCalledTimes(1)
    expect(mockShowPushesWhileOpen).toHaveBeenCalledTimes(1)
  })

  it.each([null, false])('registers nothing until signed in (%s)', async (authenticated) => {
    mockUseAuthenticated.mockReturnValue(authenticated)
    await render(<AuthenticatedLayout />)
    expect(mockRegisterForPush).not.toHaveBeenCalled()
    expect(mockShowPushesWhileOpen).not.toHaveBeenCalled()
  })

  it('goes on without pushes when the phone has no token to give', async () => {
    mockUseAuthenticated.mockReturnValue(true)
    mockRegisterForPush.mockRejectedValue(new Error('no token on a simulator'))
    await render(<AuthenticatedLayout />)
    expect(screen.getByTestId('slot')).toBeTruthy()
  })

  it('opens the notifications a tapped push is about', async () => {
    mockUseAuthenticated.mockReturnValue(true)
    mockLastResponse.mockReturnValue({ notification: {} })
    await render(<AuthenticatedLayout />)
    expect(mockPush).toHaveBeenCalledWith('/notifications')
  })

  it('registers once the check in flight says signed in', async () => {
    mockUseAuthenticated.mockReturnValue(null)
    const { rerender } = await render(<AuthenticatedLayout />)
    mockUseAuthenticated.mockReturnValue(true)
    await rerender(<AuthenticatedLayout />)
    expect(mockRegisterForPush).toHaveBeenCalledTimes(1)
  })

  it('opens the notifications for a push tapped while the app is open', async () => {
    mockUseAuthenticated.mockReturnValue(true)
    const { rerender } = await render(<AuthenticatedLayout />)
    mockLastResponse.mockReturnValue({ notification: {} })
    await rerender(<AuthenticatedLayout />)
    expect(mockPush).toHaveBeenCalledWith('/notifications')
  })

  it('opens nothing with no push tapped, or before signing in', async () => {
    mockUseAuthenticated.mockReturnValue(true)
    await render(<AuthenticatedLayout />)
    mockUseAuthenticated.mockReturnValue(false)
    mockLastResponse.mockReturnValue({ notification: {} })
    await render(<AuthenticatedLayout />)
    expect(mockPush).not.toHaveBeenCalled()
  })

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
