import TwoFactor from '@/app/two-factor'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockCompleteMfaChallenge = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({ completeMfaChallenge: (...args: unknown[]) => mockCompleteMfaChallenge(...args) }),
}))

const mockReplace = jest.fn()
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    router: { replace: (...args: unknown[]) => mockReplace(...args) },
    Link: ({ children, testID }: { children: unknown; testID?: string }) => <Text testID={testID}>{children}</Text>,
  }
})

describe('TwoFactor', () => {
  beforeEach(() => jest.clearAllMocks())

  it('finishes the login with the code, trimmed, and lands on home', async () => {
    mockCompleteMfaChallenge.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
    await render(<TwoFactor />)
    await fireEvent.changeText(screen.getByTestId('two-factor-code-input'), ' 123456 ')
    await fireEvent.press(screen.getByTestId('two-factor-submit'))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
    expect(mockCompleteMfaChallenge).toHaveBeenCalledWith('123456')
  })

  it('shows the heading, hint, and a numeric code field that the OS can autofill', async () => {
    await render(<TwoFactor />)
    expect(screen.getByTestId('two-factor-heading').props.children).toBe('Two-factor authentication')
    expect(screen.getByTestId('two-factor-hint').props.children).toContain('recovery codes')
    const input = screen.getByTestId('two-factor-code-input')
    expect(input.props.placeholder).toBe('Code')
    expect(input.props.keyboardType).toBe('number-pad')
    expect(input.props.autoComplete).toBe('one-time-code')
    expect(input.props.textContentType).toBe('oneTimeCode')
    expect(input.props.value).toBe('')
  })

  it('refuses to submit an empty or blank code', async () => {
    await render(<TwoFactor />)
    expect(screen.getByTestId('two-factor-submit').props.accessibilityState.disabled).toBe(true)
    await fireEvent.changeText(screen.getByTestId('two-factor-code-input'), '   ')
    expect(screen.getByTestId('two-factor-submit').props.accessibilityState.disabled).toBe(true)
    await fireEvent.changeText(screen.getByTestId('two-factor-code-input'), '1')
    expect(screen.getByTestId('two-factor-submit').props.accessibilityState.disabled).toBe(false)
  })

  it("shows the server's reason for a wrong code and stays put", async () => {
    mockCompleteMfaChallenge.mockResolvedValue({
      data: undefined,
      error: { errors: [{ code: 'incorrect_code', message: 'Incorrect code.' }] },
    })
    await render(<TwoFactor />)
    await fireEvent.changeText(screen.getByTestId('two-factor-code-input'), '000000')
    await fireEvent.press(screen.getByTestId('two-factor-submit'))
    await waitFor(() => expect(screen.getByTestId('two-factor-error').props.children).toBe('Incorrect code.'))
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.getByTestId('two-factor-submit-label').props.children).toBe('Verify')
  })

  it('falls back to its own message when the refusal names no reason', async () => {
    mockCompleteMfaChallenge.mockResolvedValue({ data: undefined, error: {} })
    await render(<TwoFactor />)
    await fireEvent.changeText(screen.getByTestId('two-factor-code-input'), '000000')
    await fireEvent.press(screen.getByTestId('two-factor-submit'))
    await waitFor(() =>
      expect(screen.getByTestId('two-factor-error').props.children).toBe("That code didn't work. Try again.")
    )
  })

  it('does not count a pending, unauthenticated answer as signed in', async () => {
    mockCompleteMfaChallenge.mockResolvedValue({ data: { meta: { is_authenticated: false } }, error: undefined })
    await render(<TwoFactor />)
    await fireEvent.changeText(screen.getByTestId('two-factor-code-input'), '123456')
    await fireEvent.press(screen.getByTestId('two-factor-submit'))
    await waitFor(() => expect(screen.getByTestId('two-factor-error')).toBeTruthy())
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('shows a submitting state and clears an old error while the code is checked', async () => {
    mockCompleteMfaChallenge.mockResolvedValueOnce({ data: undefined, error: {} })
    await render(<TwoFactor />)
    await fireEvent.changeText(screen.getByTestId('two-factor-code-input'), '000000')
    await fireEvent.press(screen.getByTestId('two-factor-submit'))
    await waitFor(() => expect(screen.getByTestId('two-factor-error')).toBeTruthy())

    let resolve: (value: unknown) => void = () => undefined
    mockCompleteMfaChallenge.mockReturnValue(new Promise((done) => (resolve = done)))
    // Not awaited: fireEvent's own act() would wait on the promise above, which is held open.
    fireEvent.press(screen.getByTestId('two-factor-submit'))
    await waitFor(() => expect(screen.getByText('Verifying…')).toBeTruthy())
    expect(screen.queryByTestId('two-factor-error')).toBeNull()
    expect(screen.getByTestId('two-factor-submit').props.accessibilityState.disabled).toBe(true)
    resolve({ data: { meta: { is_authenticated: true } }, error: undefined })
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })

  it('links back to the login screen', async () => {
    await render(<TwoFactor />)
    expect(screen.getByTestId('two-factor-login-link')).toBeTruthy()
    expect(screen.getByText('Back to log in')).toBeTruthy()
  })

  it('falls back to its own message when the refusal carries an empty error list', async () => {
    mockCompleteMfaChallenge.mockResolvedValue({ data: undefined, error: { errors: [] } })
    await render(<TwoFactor />)
    await fireEvent.changeText(screen.getByTestId('two-factor-code-input'), '000000')
    await fireEvent.press(screen.getByTestId('two-factor-submit'))
    await waitFor(() =>
      expect(screen.getByTestId('two-factor-error').props.children).toBe("That code didn't work. Try again.")
    )
  })
})
