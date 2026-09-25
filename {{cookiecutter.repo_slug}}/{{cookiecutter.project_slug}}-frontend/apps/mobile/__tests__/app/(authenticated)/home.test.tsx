import Home from '@/app/(authenticated)/home'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockSession = jest.fn()
const mockLogout = jest.fn()
jest.mock('@/lib/session', () => ({ getAuthApi: () => ({ session: () => mockSession(), logout: () => mockLogout() }) }))

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) } }))

describe('Home', () => {
  beforeEach(() => jest.clearAllMocks())

  it("shows the logged-in user's email once the session loads", async () => {
    mockSession.mockResolvedValue({ data: { data: { user: { email: 'jane@test.test' } } } })
    await render(<Home />)
    await waitFor(() => expect(screen.getByText("You're logged in as jane@test.test")).toBeTruthy())
  })

  it('shows a plain heading when the session has no email yet', async () => {
    mockSession.mockResolvedValue({ data: undefined })
    await render(<Home />)
    await waitFor(() => expect(mockSession).toHaveBeenCalled())
    expect(screen.getByText("You're logged in")).toBeTruthy()
  })

  it('does not update state after unmount', async () => {
    // A spy, not just checking the text stayed absent: an unguarded setState after unmount would
    // still leave the DOM looking unchanged (nothing re-reads it), but React itself would warn
    // loudly about updating an unmounted component - that warning is what the `cancelled` guard
    // actually prevents, so it's what proves the guard ran.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    let resolveSession: (value: unknown) => void = () => undefined
    mockSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)))
    const { unmount } = await render(<Home />)
    await unmount()
    resolveSession({ data: { data: { user: { email: 'jane@test.test' } } } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText("You're logged in as jane@test.test")).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('styles the container', async () => {
    mockSession.mockResolvedValue({ data: undefined })
    await render(<Home />)
    expect(screen.getByTestId('home-container').props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    })
  })

  it('styles the heading', async () => {
    mockSession.mockResolvedValue({ data: undefined })
    await render(<Home />)
    expect(screen.getByTestId('home-heading').props.style).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })

  it('styles the logout button and its label', async () => {
    mockSession.mockResolvedValue({ data: undefined })
    await render(<Home />)
    expect(screen.getByTestId('logout-button').props.style).toEqual({
      backgroundColor: 'black',
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    })
    expect(screen.getByTestId('logout-button-label').props.style).toEqual({ color: 'white' })
  })

  it('logs out and navigates back to login', async () => {
    mockSession.mockResolvedValue({ data: { data: { user: { email: 'jane@test.test' } } } })
    mockLogout.mockResolvedValue(undefined)
    await render(<Home />)
    await fireEvent.press(screen.getByTestId('logout-button'))
    await waitFor(() => expect(mockLogout).toHaveBeenCalled())
    expect(mockReplace).toHaveBeenCalledWith('/login')
  })
})
