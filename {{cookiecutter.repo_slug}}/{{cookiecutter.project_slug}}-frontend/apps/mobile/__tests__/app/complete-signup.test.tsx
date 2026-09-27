import CompleteSignup from '@/app/complete-signup'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPendingProviderSignup = jest.fn()
const mockCompleteProviderSignup = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({
    pendingProviderSignup: () => mockPendingProviderSignup(),
    completeProviderSignup: (...args: unknown[]) => mockCompleteProviderSignup(...args),
  }),
}))

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) } }))

const pending = { data: { data: { user: { username: 'suggested', email: 'jane@test.test' } } } }

describe('CompleteSignup', () => {
  beforeEach(() => jest.clearAllMocks())

  it('redirects to login when there is no pending signup', async () => {
    mockPendingProviderSignup.mockResolvedValue({ data: undefined })
    await render(<CompleteSignup />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'))
  })

  it('renders nothing while the pending signup is loading', async () => {
    mockPendingProviderSignup.mockReturnValue(new Promise(() => undefined))
    const { toJSON } = await render(<CompleteSignup />)
    expect(toJSON()).toBeNull()
  })

  it('prefills the suggested username and shows the fixed email', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('complete-signup-email')).toBeTruthy())
    expect(screen.getByTestId('complete-signup-email').props.children).toBe('jane@test.test')
    expect(screen.getByTestId('username-input').props.value).toBe('suggested')
    expect(screen.getByTestId('complete-signup-heading').props.children).toBe('Finish setting up your account')
    expect(screen.getByTestId('username-input').props.placeholder).toBe('Username')
    expect(screen.getByTestId('password-input').props.placeholder).toBe('Password')
  })

  it('shows the idle "Finish signing up" label before any submission', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('complete-signup-submit-label')).toBeTruthy())
    expect(screen.getByTestId('complete-signup-submit-label').props.children).toBe('Finish signing up')
  })

  it('starts with an empty password field', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('password-input')).toBeTruthy())
    expect(screen.getByTestId('password-input').props.value).toBe('')
  })

  it('logs straight in when completing the signup also authenticates', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    mockCompleteProviderSignup.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('complete-signup-submit')).toBeTruthy())
    await fireEvent.changeText(screen.getByTestId('password-input'), 'correct-horse')
    await fireEvent.press(screen.getByTestId('complete-signup-submit'))
    expect(mockCompleteProviderSignup).toHaveBeenCalledWith({
      username: 'suggested',
      email: 'jane@test.test',
      password: 'correct-horse',
    })
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
  })

  it('sends back to login when the account is created but needs separate email verification', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    mockCompleteProviderSignup.mockResolvedValue({ data: undefined, error: {} })
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('complete-signup-submit')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('complete-signup-submit'))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'))
  })

  it('sends back to login when the response carries an empty errors array (no real failure)', async () => {
    // Same "empty array isn't a real failure" rule as web's own CompleteSignupForm
    // (isSuccess: Boolean(data) || !extractAuthErrors(error)?.length) - an account created but
    // needing separate email verification looks exactly like this.
    mockPendingProviderSignup.mockResolvedValue(pending)
    mockCompleteProviderSignup.mockResolvedValue({ data: undefined, error: { errors: [] } })
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('complete-signup-submit')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('complete-signup-submit'))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'))
  })

  it('shows the server error message when completing signup fails with one', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    mockCompleteProviderSignup.mockResolvedValue({
      data: undefined,
      error: { errors: [{ code: 'username_taken', param: 'username', message: 'That username is taken.' }] },
    })
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('complete-signup-submit')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('complete-signup-submit'))
    await waitFor(() => expect(screen.getByTestId('complete-signup-error')).toBeTruthy())
    expect(screen.getByTestId('complete-signup-error').props.children).toBe('That username is taken.')
    expect(mockReplace).not.toHaveBeenCalledWith('/(authenticated)/home')
  })

  it('clears a previous error message as soon as a new submission starts', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    mockCompleteProviderSignup.mockResolvedValueOnce({
      data: undefined,
      error: { errors: [{ code: 'username_taken', message: 'That username is taken.' }] },
    })
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('complete-signup-submit')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('complete-signup-submit'))
    await waitFor(() => expect(screen.getByTestId('complete-signup-error')).toBeTruthy())

    let resolveComplete: (value: unknown) => void = () => undefined
    mockCompleteProviderSignup.mockReturnValue(new Promise((resolve) => (resolveComplete = resolve)))
    // Not awaited - see "shows a submitting state" below for why.
    fireEvent.press(screen.getByTestId('complete-signup-submit'))
    await waitFor(() => expect(screen.queryByTestId('complete-signup-error')).toBeNull())
    resolveComplete({ data: { meta: { is_authenticated: true } }, error: undefined })
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
  })

  it('re-enables the submit button and resets its label after a failed submission', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    mockCompleteProviderSignup.mockResolvedValue({
      data: undefined,
      error: { errors: [{ code: 'username_taken', message: 'That username is taken.' }] },
    })
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('complete-signup-submit')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('complete-signup-submit'))
    await waitFor(() => expect(screen.getByTestId('complete-signup-error')).toBeTruthy())
    expect(screen.getByTestId('complete-signup-submit').props.accessibilityState.disabled).toBe(false)
    expect(screen.getByTestId('complete-signup-submit-label').props.children).toBe('Finish signing up')
  })

  it('shows a submitting state while the request is in flight', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    let resolveComplete: (value: unknown) => void = () => undefined
    mockCompleteProviderSignup.mockReturnValue(new Promise((resolve) => (resolveComplete = resolve)))
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('complete-signup-submit')).toBeTruthy())
    // Not awaited: the promise above deliberately never resolves, and fireEvent's own act()
    // wrapper waits for pending work to settle - awaiting it here would hang forever.
    fireEvent.press(screen.getByTestId('complete-signup-submit'))
    await waitFor(() => expect(screen.getByText('Saving…')).toBeTruthy())
    resolveComplete({ data: { meta: { is_authenticated: true } }, error: undefined })
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
  })

  it('styles the form container and heading', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('complete-signup-form')).toBeTruthy())
    expect(screen.getByTestId('complete-signup-form').props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    })
    expect(screen.getByTestId('complete-signup-heading').props.style).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })
})
