import Login from '@/app/login'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockLogin = jest.fn()
jest.mock('@/lib/session', () => ({ getAuthApi: () => ({ login: (...args: unknown[]) => mockLogin(...args) }) }))

const mockReplace = jest.fn()
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    router: { replace: (...args: unknown[]) => mockReplace(...args) },
    Link: ({ children, testID }: { children: unknown; testID?: string }) => <Text testID={testID}>{children}</Text>,
  }
})

describe('Login', () => {
  beforeEach(() => jest.clearAllMocks())

  it('navigates to the authenticated home on a successful login', async () => {
    mockLogin.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
    await render(<Login />)
    await fireEvent.changeText(screen.getByTestId('email-input'), 'jane@test.test')
    await fireEvent.changeText(screen.getByTestId('password-input'), 'correct-horse')
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
    expect(mockLogin).toHaveBeenCalledWith({ email: 'jane@test.test', password: 'correct-horse' })
  })

  it('starts with empty email and password fields', async () => {
    await render(<Login />)
    expect(screen.getByTestId('email-input').props.value).toBe('')
    expect(screen.getByTestId('password-input').props.value).toBe('')
  })

  it('shows the idle "Log in" label before any submission', async () => {
    await render(<Login />)
    expect(screen.getByTestId('login-submit-label').props.children).toBe('Log in')
  })

  it('falls back to a generic error message when errors is an empty array', async () => {
    mockLogin.mockResolvedValue({ data: undefined, error: { errors: [] } })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())
    expect(screen.getByTestId('login-error').props.children).toContain('Could not log in')
  })

  it('clears a previous error message as soon as a new submission starts', async () => {
    mockLogin.mockResolvedValueOnce({
      data: undefined,
      error: { errors: [{ code: 'invalid_credentials', message: 'Incorrect email or password.' }] },
    })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())

    let resolveLogin: (value: unknown) => void = () => undefined
    mockLogin.mockReturnValue(new Promise((resolve) => (resolveLogin = resolve)))
    // Not awaited - see "shows a submitting state" below for why.
    fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.queryByTestId('login-error')).toBeNull())
    resolveLogin({ data: { meta: { is_authenticated: true } }, error: undefined })
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })

  it('re-enables the submit button and resets its label after a failed submission', async () => {
    mockLogin.mockResolvedValue({ data: undefined, error: {} })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())
    expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(false)
    expect(screen.getByTestId('login-submit-label').props.children).toBe('Log in')
  })

  it('shows the server error message when login fails with one', async () => {
    mockLogin.mockResolvedValue({
      data: undefined,
      error: { errors: [{ code: 'invalid_credentials', message: 'Incorrect email or password.' }] },
    })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())
    expect(screen.getByTestId('login-error').props.children).toBe('Incorrect email or password.')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('falls back to a generic error message when the response carries none', async () => {
    mockLogin.mockResolvedValue({ data: undefined, error: {} })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())
    expect(screen.getByTestId('login-error').props.children).toContain('Could not log in')
  })

  it('shows a submitting state while the request is in flight', async () => {
    let resolveLogin: (value: unknown) => void = () => undefined
    mockLogin.mockReturnValue(new Promise((resolve) => (resolveLogin = resolve)))
    await render(<Login />)
    // Not awaited: the promise above deliberately never resolves, and fireEvent's own act()
    // wrapper waits for pending work to settle - awaiting it here would hang forever.
    fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByText('Logging in…')).toBeTruthy())
    resolveLogin({ data: { meta: { is_authenticated: true } }, error: undefined })
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })

  it('styles the form container', async () => {
    await render(<Login />)
    expect(screen.getByTestId('login-form').props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    })
  })

  it('styles the heading', async () => {
    await render(<Login />)
    expect(screen.getByTestId('login-heading').props.style).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })

  it('styles the submit button and its label', async () => {
    await render(<Login />)
    expect(screen.getByTestId('login-submit').props.style).toEqual({
      backgroundColor: 'black',
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    })
    expect(screen.getByTestId('login-submit-label').props.style).toEqual({ color: 'white' })
  })

  it('styles the email and password inputs identically', async () => {
    await render(<Login />)
    const expected = { borderWidth: 1, borderRadius: 8, padding: 12 }
    expect(screen.getByTestId('email-input').props.style).toEqual(expected)
    expect(screen.getByTestId('password-input').props.style).toEqual(expected)
  })

  it('styles the error message red', async () => {
    mockLogin.mockResolvedValue({ data: undefined, error: {} })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())
    expect(screen.getByTestId('login-error').props.style).toEqual({ color: 'red' })
  })

  it('links to the signup screen', async () => {
    await render(<Login />)
    expect(screen.getByTestId('signup-link')).toBeTruthy()
  })
})
