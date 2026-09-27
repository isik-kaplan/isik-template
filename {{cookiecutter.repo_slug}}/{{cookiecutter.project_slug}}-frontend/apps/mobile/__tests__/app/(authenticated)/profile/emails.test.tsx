import ProfileEmails from '@/app/(authenticated)/profile/emails'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockEmails = jest.fn()
const mockAddEmail = jest.fn()
const mockMakeEmailPrimary = jest.fn()
const mockResendEmailVerification = jest.fn()
const mockRemoveEmail = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({
    emails: () => mockEmails(),
    addEmail: (...args: unknown[]) => mockAddEmail(...args),
    makeEmailPrimary: (...args: unknown[]) => mockMakeEmailPrimary(...args),
    resendEmailVerification: (...args: unknown[]) => mockResendEmailVerification(...args),
    removeEmail: (...args: unknown[]) => mockRemoveEmail(...args),
  }),
}))

const twoEmails = [
  { email: 'primary@test.test', primary: true, verified: true },
  { email: 'secondary@test.test', primary: false, verified: false },
]

describe('ProfileEmails', () => {
  beforeEach(() => jest.clearAllMocks())

  it('lists every email once loaded, marking primary and unverified ones', async () => {
    mockEmails.mockResolvedValue({ data: { data: twoEmails } })
    await render(<ProfileEmails />)
    await waitFor(() => expect(screen.getByTestId('email-row-primary@test.test')).toBeTruthy())
    expect(screen.getByTestId('email-row-secondary@test.test')).toBeTruthy()
    expect(screen.getByTestId('email-label-primary@test.test').props.children.join('')).toBe(
      'primary@test.test (primary)'
    )
    expect(screen.getByTestId('email-label-secondary@test.test').props.children.join('')).toBe(
      'secondary@test.test (unverified)'
    )
    expect(screen.getByTestId('profile-emails-heading').props.children).toBe('Email addresses')
    expect(screen.getByText('Resend')).toBeTruthy()
    expect(screen.getByText('Remove')).toBeTruthy()
  })

  it('starts with no email rows and an empty new-email input before the list loads', async () => {
    mockEmails.mockReturnValue(new Promise(() => undefined))
    await render(<ProfileEmails />)
    expect(screen.queryByTestId(/email-row-/)).toBeNull()
    expect(screen.getByTestId('new-email-input').props.value).toBe('')
    expect(screen.getByTestId('new-email-input').props.placeholder).toBe('Add an email')
  })

  it('defaults to an empty list when the session carries none', async () => {
    mockEmails.mockResolvedValue({ data: undefined })
    await render(<ProfileEmails />)
    await waitFor(() => expect(mockEmails).toHaveBeenCalled())
    expect(screen.queryByTestId(/email-label-/)).toBeNull()
  })

  it('does not update state after unmount', async () => {
    let resolveEmails: (value: unknown) => void = () => undefined
    mockEmails.mockReturnValue(new Promise((resolve) => (resolveEmails = resolve)))
    const { unmount } = await render(<ProfileEmails />)
    await unmount()
    resolveEmails({ data: { data: twoEmails } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTestId('email-label-primary@test.test')).toBeNull()
  })

  it('only offers "make primary" for a verified, non-primary email', async () => {
    mockEmails.mockResolvedValue({ data: { data: twoEmails } })
    await render(<ProfileEmails />)
    await waitFor(() => expect(screen.getByTestId('email-label-primary@test.test')).toBeTruthy())
    expect(screen.queryByTestId('make-primary-primary@test.test')).toBeNull()
    // secondary@test.test is unverified, so it can't be made primary either.
    expect(screen.queryByTestId('make-primary-secondary@test.test')).toBeNull()
  })

  it('makes a verified, non-primary email primary', async () => {
    mockEmails.mockResolvedValue({
      data: {
        data: [
          { email: 'primary@test.test', primary: true, verified: true },
          { email: 'other@test.test', primary: false, verified: true },
        ],
      },
    })
    mockMakeEmailPrimary.mockResolvedValue({
      data: {
        data: [
          { email: 'other@test.test', primary: true, verified: true },
          { email: 'primary@test.test', primary: false, verified: true },
        ],
      },
    })
    await render(<ProfileEmails />)
    await waitFor(() => expect(screen.getByTestId('make-primary-other@test.test')).toBeTruthy())
    expect(screen.getByText('Make primary')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('make-primary-other@test.test'))
    expect(mockMakeEmailPrimary).toHaveBeenCalledWith('other@test.test')
    await waitFor(() =>
      expect(screen.getByTestId('email-label-other@test.test').props.children.join('')).toBe(
        'other@test.test (primary)'
      )
    )
  })

  it('leaves the list untouched when making an email primary fails', async () => {
    mockEmails.mockResolvedValue({
      data: {
        data: [
          { email: 'primary@test.test', primary: true, verified: true },
          { email: 'other@test.test', primary: false, verified: true },
        ],
      },
    })
    mockMakeEmailPrimary.mockResolvedValue({ data: undefined, error: {} })
    await render(<ProfileEmails />)
    await waitFor(() => expect(screen.getByTestId('make-primary-other@test.test')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('make-primary-other@test.test'))
    expect(screen.getByTestId('email-label-other@test.test').props.children.join('')).toBe('other@test.test')
  })

  it('resends verification for an unverified email', async () => {
    mockEmails.mockResolvedValue({ data: { data: twoEmails } })
    mockResendEmailVerification.mockResolvedValue({ data: undefined })
    await render(<ProfileEmails />)
    await waitFor(() => expect(screen.getByTestId('resend-verification-secondary@test.test')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('resend-verification-secondary@test.test'))
    expect(mockResendEmailVerification).toHaveBeenCalledWith('secondary@test.test')
  })

  it('removes a non-primary email', async () => {
    mockEmails.mockResolvedValue({ data: { data: twoEmails } })
    mockRemoveEmail.mockResolvedValue({ data: { data: [twoEmails[0]] } })
    await render(<ProfileEmails />)
    await waitFor(() => expect(screen.getByTestId('remove-email-secondary@test.test')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('remove-email-secondary@test.test'))
    expect(mockRemoveEmail).toHaveBeenCalledWith('secondary@test.test')
    await waitFor(() => expect(screen.queryByTestId('email-label-secondary@test.test')).toBeNull())
  })

  it('leaves the list untouched when removing an email fails', async () => {
    mockEmails.mockResolvedValue({ data: { data: twoEmails } })
    mockRemoveEmail.mockResolvedValue({ data: undefined, error: {} })
    await render(<ProfileEmails />)
    await waitFor(() => expect(screen.getByTestId('remove-email-secondary@test.test')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('remove-email-secondary@test.test'))
    expect(screen.getByTestId('email-label-secondary@test.test')).toBeTruthy()
  })

  it('cannot remove the primary email', async () => {
    mockEmails.mockResolvedValue({ data: { data: twoEmails } })
    await render(<ProfileEmails />)
    await waitFor(() => expect(screen.getByTestId('email-label-primary@test.test')).toBeTruthy())
    expect(screen.queryByTestId('remove-email-primary@test.test')).toBeNull()
  })

  it('adds a new email and clears the input on success', async () => {
    mockEmails.mockResolvedValue({ data: { data: [] } })
    mockAddEmail.mockResolvedValue({ data: { data: [{ email: 'new@test.test', primary: false, verified: false }] } })
    await render(<ProfileEmails />)
    await fireEvent.changeText(screen.getByTestId('new-email-input'), 'new@test.test')
    await fireEvent.press(screen.getByTestId('add-email-submit'))
    expect(mockAddEmail).toHaveBeenCalledWith('new@test.test')
    await waitFor(() => expect(screen.getByTestId('email-label-new@test.test')).toBeTruthy())
    expect(screen.getByTestId('new-email-input').props.value).toBe('')
  })

  it('shows the idle "Add email" label before any submission', async () => {
    mockEmails.mockResolvedValue({ data: { data: [] } })
    await render(<ProfileEmails />)
    expect(screen.getByTestId('add-email-submit-label').props.children).toBe('Add email')
  })

  it('falls back to a generic error message when adding fails with an empty errors array', async () => {
    mockEmails.mockResolvedValue({ data: { data: [] } })
    mockAddEmail.mockResolvedValue({ data: undefined, error: { errors: [] } })
    await render(<ProfileEmails />)
    await fireEvent.press(screen.getByTestId('add-email-submit'))
    await waitFor(() => expect(screen.getByTestId('profile-emails-error')).toBeTruthy())
    expect(screen.getByTestId('profile-emails-error').props.children).toBe('Could not add that email.')
  })

  it('falls back to a generic error message when the response carries no errors at all', async () => {
    mockEmails.mockResolvedValue({ data: { data: [] } })
    mockAddEmail.mockResolvedValue({ data: undefined, error: {} })
    await render(<ProfileEmails />)
    await fireEvent.press(screen.getByTestId('add-email-submit'))
    await waitFor(() => expect(screen.getByTestId('profile-emails-error')).toBeTruthy())
    expect(screen.getByTestId('profile-emails-error').props.children).toBe('Could not add that email.')
  })

  it('clears a previous error message as soon as a new submission starts', async () => {
    mockEmails.mockResolvedValue({ data: { data: [] } })
    mockAddEmail.mockResolvedValueOnce({ data: undefined, error: {} })
    await render(<ProfileEmails />)
    await fireEvent.press(screen.getByTestId('add-email-submit'))
    await waitFor(() => expect(screen.getByTestId('profile-emails-error')).toBeTruthy())

    let resolveAdd: (value: unknown) => void = () => undefined
    mockAddEmail.mockReturnValue(new Promise((resolve) => (resolveAdd = resolve)))
    // Not awaited - see "shows a submitting state" below for why.
    fireEvent.press(screen.getByTestId('add-email-submit'))
    await waitFor(() => expect(screen.queryByTestId('profile-emails-error')).toBeNull())
    resolveAdd({ data: { data: [] } })
  })

  it('shows the server error message when adding fails with one', async () => {
    mockEmails.mockResolvedValue({ data: { data: [] } })
    mockAddEmail.mockResolvedValue({
      data: undefined,
      error: { errors: [{ code: 'email_taken', param: 'email', message: 'That email is already in use.' }] },
    })
    await render(<ProfileEmails />)
    await fireEvent.press(screen.getByTestId('add-email-submit'))
    await waitFor(() => expect(screen.getByTestId('profile-emails-error')).toBeTruthy())
    expect(screen.getByTestId('profile-emails-error').props.children).toBe('That email is already in use.')
  })

  it('shows a submitting state while adding is in flight', async () => {
    mockEmails.mockResolvedValue({ data: { data: [] } })
    let resolveAdd: (value: unknown) => void = () => undefined
    mockAddEmail.mockReturnValue(new Promise((resolve) => (resolveAdd = resolve)))
    await render(<ProfileEmails />)
    // Not awaited: the promise above deliberately never resolves, and fireEvent's own act()
    // wrapper waits for pending work to settle - awaiting it here would hang forever.
    fireEvent.press(screen.getByTestId('add-email-submit'))
    await waitFor(() => expect(screen.getByText('Adding…')).toBeTruthy())
    resolveAdd({ data: { data: [] } })
    await waitFor(() => expect(screen.getByTestId('add-email-submit-label').props.children).toBe('Add email'))
  })

  it('styles the actions row for each email', async () => {
    mockEmails.mockResolvedValue({ data: { data: twoEmails } })
    await render(<ProfileEmails />)
    await waitFor(() => expect(screen.getByTestId('email-actions-primary@test.test')).toBeTruthy())
    expect(screen.getByTestId('email-actions-primary@test.test').props.style).toEqual({ flexDirection: 'row', gap: 8 })
  })

  it('styles the screen and heading', async () => {
    mockEmails.mockResolvedValue({ data: { data: [] } })
    await render(<ProfileEmails />)
    expect(screen.getByTestId('profile-emails').props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    })
    expect(screen.getByTestId('profile-emails-heading').props.style).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })
})
