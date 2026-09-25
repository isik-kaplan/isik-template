import Signup from '@/app/signup'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockSignup = jest.fn()
jest.mock('@/lib/session', () => ({ getAuthApi: () => ({ signup: (...args: unknown[]) => mockSignup(...args) }) }))

const mockReplace = jest.fn()
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    router: { replace: (...args: unknown[]) => mockReplace(...args) },
    Link: ({ children, testID }: { children: unknown; testID?: string }) => <Text testID={testID}>{children}</Text>,
  }
})

describe('Signup', () => {
  beforeEach(() => jest.clearAllMocks())

  it('navigates to the authenticated home on a successful signup', async () => {
    mockSignup.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
    await render(<Signup />)
    await fireEvent.changeText(screen.getByTestId('username-input'), 'jane')
    await fireEvent.changeText(screen.getByTestId('email-input'), 'jane@test.test')
    await fireEvent.changeText(screen.getByTestId('password-input'), 'correct-horse')
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
    expect(mockSignup).toHaveBeenCalledWith({ username: 'jane', email: 'jane@test.test', password: 'correct-horse' })
  })

  it('starts with empty username, email and password fields', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('username-input').props.value).toBe('')
    expect(screen.getByTestId('email-input').props.value).toBe('')
    expect(screen.getByTestId('password-input').props.value).toBe('')
  })

  it('shows the idle "Sign up" label before any submission', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('signup-submit-label').props.children).toBe('Sign up')
  })

  it('falls back to a generic error message when errors is an empty array', async () => {
    mockSignup.mockResolvedValue({ data: undefined, error: { errors: [] } })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())
    expect(screen.getByTestId('signup-error').props.children).toContain('Could not sign up')
  })

  it('clears a previous error message as soon as a new submission starts', async () => {
    mockSignup.mockResolvedValueOnce({
      data: undefined,
      error: { errors: [{ code: 'email_taken', param: 'email', message: 'That email is already in use.' }] },
    })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())

    let resolveSignup: (value: unknown) => void = () => undefined
    mockSignup.mockReturnValue(new Promise((resolve) => (resolveSignup = resolve)))
    // Not awaited - see "shows a submitting state" below for why.
    fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.queryByTestId('signup-error')).toBeNull())
    resolveSignup({ data: { meta: { is_authenticated: true } }, error: undefined })
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })

  it('re-enables the submit button and resets its label after a failed submission', async () => {
    mockSignup.mockResolvedValue({ data: undefined, error: {} })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())
    expect(screen.getByTestId('signup-submit').props.accessibilityState.disabled).toBe(false)
    expect(screen.getByTestId('signup-submit-label').props.children).toBe('Sign up')
  })

  it('shows the server error message when signup fails with one', async () => {
    mockSignup.mockResolvedValue({
      data: undefined,
      error: { errors: [{ code: 'email_taken', param: 'email', message: 'That email is already in use.' }] },
    })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())
    expect(screen.getByTestId('signup-error').props.children).toBe('That email is already in use.')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('falls back to a generic error message when the response carries none', async () => {
    mockSignup.mockResolvedValue({ data: undefined, error: {} })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())
    expect(screen.getByTestId('signup-error').props.children).toContain('Could not sign up')
  })

  it('shows a submitting state while the request is in flight', async () => {
    let resolveSignup: (value: unknown) => void = () => undefined
    mockSignup.mockReturnValue(new Promise((resolve) => (resolveSignup = resolve)))
    await render(<Signup />)
    // Not awaited: the promise above deliberately never resolves, and fireEvent's own act()
    // wrapper waits for pending work to settle - awaiting it here would hang forever.
    fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByText('Signing up…')).toBeTruthy())
    resolveSignup({ data: { meta: { is_authenticated: true } }, error: undefined })
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })

  it('styles the form container', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('signup-form').props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    })
  })

  it('styles the heading', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('signup-heading').props.style).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })

  it('styles the submit button and its label', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('signup-submit').props.style).toEqual({
      backgroundColor: 'black',
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    })
    expect(screen.getByTestId('signup-submit-label').props.style).toEqual({ color: 'white' })
  })

  it('styles the username, email and password inputs identically', async () => {
    await render(<Signup />)
    const expected = { borderWidth: 1, borderRadius: 8, padding: 12 }
    expect(screen.getByTestId('username-input').props.style).toEqual(expected)
    expect(screen.getByTestId('email-input').props.style).toEqual(expected)
    expect(screen.getByTestId('password-input').props.style).toEqual(expected)
  })

  it('styles the error message red', async () => {
    mockSignup.mockResolvedValue({ data: undefined, error: {} })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())
    expect(screen.getByTestId('signup-error').props.style).toEqual({ color: 'red' })
  })

  it('links to the login screen', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('login-link')).toBeTruthy()
  })
})
