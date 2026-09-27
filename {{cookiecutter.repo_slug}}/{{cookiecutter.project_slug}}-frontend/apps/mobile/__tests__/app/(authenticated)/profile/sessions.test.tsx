import ProfileSessions from '@/app/(authenticated)/profile/sessions'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockSessions = jest.fn()
const mockEndSessions = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({ sessions: () => mockSessions(), endSessions: (...args: unknown[]) => mockEndSessions(...args) }),
}))

const twoSessions = [
  { id: 1, ip: '1.1.1.1', is_current: true, user_agent: 'ua-1', created_at: 0 },
  { id: 2, ip: '2.2.2.2', is_current: false, user_agent: 'ua-2', created_at: 0 },
]

describe('ProfileSessions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('lists every session, marking the current device', async () => {
    mockSessions.mockResolvedValue({ data: { data: twoSessions } })
    await render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByTestId('session-row-1')).toBeTruthy())
    expect(screen.getByTestId('session-label-1').props.children.join('')).toBe('1.1.1.1 (this device)')
    expect(screen.getByTestId('session-label-2').props.children.join('')).toBe('2.2.2.2')
    expect(screen.getByTestId('profile-sessions-heading').props.children).toBe('Active sessions')
  })

  it('starts with no session rows before the session list loads', async () => {
    mockSessions.mockReturnValue(new Promise(() => undefined))
    await render(<ProfileSessions />)
    expect(screen.queryByTestId(/session-row-/)).toBeNull()
  })

  it('defaults to an empty list when the session carries none', async () => {
    mockSessions.mockResolvedValue({ data: undefined })
    await render(<ProfileSessions />)
    await waitFor(() => expect(mockSessions).toHaveBeenCalled())
    expect(screen.queryByTestId(/session-label-/)).toBeNull()
  })

  it('does not update state after unmount', async () => {
    let resolveSessions: (value: unknown) => void = () => undefined
    mockSessions.mockReturnValue(new Promise((resolve) => (resolveSessions = resolve)))
    const { unmount } = await render(<ProfileSessions />)
    await unmount()
    resolveSessions({ data: { data: twoSessions } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTestId('session-label-1')).toBeNull()
  })

  it('does not offer to revoke the current session', async () => {
    mockSessions.mockResolvedValue({ data: { data: twoSessions } })
    await render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByTestId('session-label-1')).toBeTruthy())
    expect(screen.queryByTestId('revoke-session-1')).toBeNull()
  })

  it('revokes a single other session', async () => {
    mockSessions.mockResolvedValue({ data: { data: twoSessions } })
    mockEndSessions.mockResolvedValue({ data: { data: [twoSessions[0]] } })
    await render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByTestId('revoke-session-2')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('revoke-session-2'))
    expect(mockEndSessions).toHaveBeenCalledWith([2])
    await waitFor(() => expect(screen.queryByTestId('session-label-2')).toBeNull())
  })

  it('leaves the list untouched when ending a session fails', async () => {
    mockSessions.mockResolvedValue({ data: { data: twoSessions } })
    mockEndSessions.mockResolvedValue({ data: undefined, error: {} })
    await render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByTestId('revoke-session-2')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('revoke-session-2'))
    expect(screen.getByTestId('session-label-2')).toBeTruthy()
  })

  it('shows a "Revoking…" label while a session is being ended', async () => {
    mockSessions.mockResolvedValue({ data: { data: twoSessions } })
    let resolveEnd: (value: unknown) => void = () => undefined
    mockEndSessions.mockReturnValue(new Promise((resolve) => (resolveEnd = resolve)))
    await render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByTestId('revoke-session-2')).toBeTruthy())
    // Not awaited: the promise above deliberately never resolves, and fireEvent's own act()
    // wrapper waits for pending work to settle - awaiting it here would hang forever.
    fireEvent.press(screen.getByTestId('revoke-session-2'))
    await waitFor(() => expect(screen.getByText('Revoking…')).toBeTruthy())
    resolveEnd({ data: { data: twoSessions } })
    await waitFor(() => expect(screen.getByText('Revoke')).toBeTruthy())
  })

  it('offers to revoke every other session at once when there is more than one', async () => {
    mockSessions.mockResolvedValue({ data: { data: twoSessions } })
    mockEndSessions.mockResolvedValue({ data: { data: [twoSessions[0]] } })
    await render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByTestId('revoke-other-sessions')).toBeTruthy())
    expect(screen.getByTestId('revoke-other-sessions-label').props.children).toBe('Log out other sessions')
    await fireEvent.press(screen.getByTestId('revoke-other-sessions'))
    expect(mockEndSessions).toHaveBeenCalledWith([2])
  })

  it('disables "revoke others" while any revoke is in flight', async () => {
    mockSessions.mockResolvedValue({ data: { data: twoSessions } })
    mockEndSessions.mockReturnValue(new Promise(() => undefined))
    await render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByTestId('revoke-other-sessions')).toBeTruthy())
    expect(screen.getByTestId('revoke-other-sessions').props.accessibilityState.disabled).toBe(false)
    // Not awaited: the promise above deliberately never resolves, and fireEvent's own act()
    // wrapper waits for pending work to settle - awaiting it here would hang forever.
    fireEvent.press(screen.getByTestId('revoke-session-2'))
    await waitFor(() =>
      expect(screen.getByTestId('revoke-other-sessions').props.accessibilityState.disabled).toBe(true)
    )
  })

  it('hides the "revoke others" button when there are no other sessions', async () => {
    mockSessions.mockResolvedValue({ data: { data: [twoSessions[0]] } })
    await render(<ProfileSessions />)
    await waitFor(() => expect(screen.getByTestId('session-label-1')).toBeTruthy())
    expect(screen.queryByTestId('revoke-other-sessions')).toBeNull()
  })

  it('styles the screen and heading', async () => {
    mockSessions.mockResolvedValue({ data: { data: [] } })
    await render(<ProfileSessions />)
    expect(screen.getByTestId('profile-sessions').props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    })
    expect(screen.getByTestId('profile-sessions-heading').props.style).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })
})
