import CompleteSignup from '@/app/complete-signup'
import type { NameRequirement } from '@/lib/nameRequirement'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

let mockRequirement: NameRequirement = 'username_with_optional_full'
jest.mock('@/lib/nameRequirement', () => ({
  get NAME_REQUIREMENT() {
    return mockRequirement
  },
}))

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

// Each requirement's names as the backend's NameRequirement offers them, in form order.
const OFFERED: [NameRequirement, string[]][] = [
  ['username_with_optional_full', ['username', 'first_name', 'last_name']],
  ['full_only', ['first_name', 'last_name']],
  ['full_and_username', ['first_name', 'last_name', 'username']],
  ['full_with_optional_username', ['first_name', 'last_name', 'username']],
  ['username_only', ['username']],
]
const TEST_IDS: Record<string, string> = {
  first_name: 'first-name-input',
  last_name: 'last-name-input',
  username: 'username-input',
}
const PLACEHOLDERS: Record<string, string> = { first_name: 'First name', last_name: 'Last name', username: 'Username' }
const VALUES: Record<string, string> = { first_name: 'Jane', last_name: 'Doe', username: 'jane' }
const inputOrder = () => screen.getAllByTestId(/-input$/).map((node) => node.props.testID)

describe('CompleteSignup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirement = 'username_with_optional_full'
  })

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

  it('says finishing a social signup is agreeing to the legal documents', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('legal-consent-notice')).toBeTruthy())
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
      first_name: '',
      last_name: '',
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
    // An account created but awaiting email verification looks exactly like this.
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
    // Not awaited: fireEvent's act() would wait on the never-resolving promise.
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

  it('says to wait when refused for coming too often, rather than taking the refusal for an account made', async () => {
    mockPendingProviderSignup.mockResolvedValue(pending)
    mockCompleteProviderSignup.mockResolvedValue({
      data: undefined,
      error: { status: 429 },
      response: new Response(null, { status: 429 }),
    })
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('complete-signup-submit')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('complete-signup-submit'))
    await waitFor(() =>
      expect(screen.getByTestId('complete-signup-error').props.children).toBe(
        'Too many requests. Wait a moment, then try again.'
      )
    )
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('starts the handle empty when the provider suggests none', async () => {
    mockPendingProviderSignup.mockResolvedValue({ data: { data: { user: { email: 'jane@test.test' } } } })
    await render(<CompleteSignup />)
    await waitFor(() => expect(screen.getByTestId('username-input')).toBeTruthy())
    expect(screen.getByTestId('username-input').props.value).toBe('')
  })

  describe.each(OFFERED)('under %s', (name, offered) => {
    beforeEach(() => {
      mockRequirement = name
    })

    it('asks for exactly its names, in its order, before the password', async () => {
      mockPendingProviderSignup.mockResolvedValue(pending)
      await render(<CompleteSignup />)
      await waitFor(() => expect(screen.getByTestId('password-input')).toBeTruthy())
      expect(inputOrder()).toEqual([...offered.map((field) => TEST_IDS[field]), 'password-input'])
      for (const field of offered) {
        expect(screen.getByTestId(TEST_IDS[field]).props.placeholder).toBe(PLACEHOLDERS[field])
      }
    })

    it('sends only its names, the suggested handle only where one is asked for', async () => {
      mockPendingProviderSignup.mockResolvedValue(pending)
      mockCompleteProviderSignup.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
      await render(<CompleteSignup />)
      await waitFor(() => expect(screen.getByTestId('password-input')).toBeTruthy())
      for (const field of offered) {
        if (field !== 'username') await fireEvent.changeText(screen.getByTestId(TEST_IDS[field]), VALUES[field])
      }
      await fireEvent.changeText(screen.getByTestId('password-input'), 'correct-horse')
      await fireEvent.press(screen.getByTestId('complete-signup-submit'))
      await waitFor(() => expect(mockReplace).toHaveBeenCalled())
      expect(mockCompleteProviderSignup).toHaveBeenCalledWith({
        email: 'jane@test.test',
        password: 'correct-horse',
        ...Object.fromEntries(offered.map((field) => [field, field === 'username' ? 'suggested' : VALUES[field]])),
      })
    })
  })
})
