import ProfileConnections from '@/app/(authenticated)/profile/connections'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockProviders = jest.fn()
const mockDisconnectProvider = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({
    providers: () => mockProviders(),
    disconnectProvider: (...args: unknown[]) => mockDisconnectProvider(...args),
  }),
}))

const oneAccount = [{ id: 1, provider: { id: 'google', name: 'Google' }, uid: 'uid-1', display: { name: 'jane' } }]

describe('ProfileConnections', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows an empty message when there are no connected accounts', async () => {
    mockProviders.mockResolvedValue({ data: { data: [] } })
    await render(<ProfileConnections />)
    await waitFor(() => expect(screen.getByTestId('profile-connections-empty')).toBeTruthy())
    expect(screen.getByTestId('profile-connections-empty').props.children).toBe('No connected accounts yet.')
    expect(screen.getByTestId('profile-connections-heading').props.children).toBe('Connected accounts')
  })

  it('defaults to an empty list when the session carries none', async () => {
    mockProviders.mockResolvedValue({ data: undefined })
    await render(<ProfileConnections />)
    await waitFor(() => expect(screen.getByTestId('profile-connections-empty')).toBeTruthy())
  })

  it('lists every connected account', async () => {
    mockProviders.mockResolvedValue({ data: { data: oneAccount } })
    await render(<ProfileConnections />)
    await waitFor(() => expect(screen.getByTestId('connection-row-1')).toBeTruthy())
    expect(screen.getByTestId('connection-label-1').props.children).toBe('Google')
    expect(screen.queryByTestId('profile-connections-empty')).toBeNull()
  })

  it('does not update state after unmount', async () => {
    let resolveProviders: (value: unknown) => void = () => undefined
    mockProviders.mockReturnValue(new Promise((resolve) => (resolveProviders = resolve)))
    const { unmount } = await render(<ProfileConnections />)
    await unmount()
    resolveProviders({ data: { data: oneAccount } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTestId('connection-label-1')).toBeNull()
  })

  it('disconnects a connected account', async () => {
    mockProviders.mockResolvedValue({ data: { data: oneAccount } })
    mockDisconnectProvider.mockResolvedValue({ data: { data: [] } })
    await render(<ProfileConnections />)
    await waitFor(() => expect(screen.getByTestId('disconnect-1')).toBeTruthy())
    expect(screen.getByText('Disconnect')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('disconnect-1'))
    expect(mockDisconnectProvider).toHaveBeenCalledWith('google', 'uid-1')
    await waitFor(() => expect(screen.getByTestId('profile-connections-empty')).toBeTruthy())
  })

  it('leaves the list untouched when disconnecting fails', async () => {
    mockProviders.mockResolvedValue({ data: { data: oneAccount } })
    mockDisconnectProvider.mockResolvedValue({ data: undefined, error: {} })
    await render(<ProfileConnections />)
    await waitFor(() => expect(screen.getByTestId('disconnect-1')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('disconnect-1'))
    expect(screen.getByTestId('connection-label-1')).toBeTruthy()
  })

  it('styles the screen and heading', async () => {
    mockProviders.mockResolvedValue({ data: { data: [] } })
    await render(<ProfileConnections />)
    expect(screen.getByTestId('profile-connections').props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    })
    expect(screen.getByTestId('profile-connections-heading').props.style).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })
})
