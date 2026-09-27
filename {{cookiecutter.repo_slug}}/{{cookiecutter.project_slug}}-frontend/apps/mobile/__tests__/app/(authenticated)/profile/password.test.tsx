import ProfilePassword from '@/app/(authenticated)/profile/password'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockChangePassword = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({ changePassword: (...args: unknown[]) => mockChangePassword(...args) }),
}))

describe('ProfilePassword', () => {
  beforeEach(() => jest.clearAllMocks())

  it('starts with empty password fields', async () => {
    await render(<ProfilePassword />)
    expect(screen.getByTestId('current-password-input').props.value).toBe('')
    expect(screen.getByTestId('new-password-input').props.value).toBe('')
  })

  it('shows the heading and input placeholders', async () => {
    await render(<ProfilePassword />)
    expect(screen.getByTestId('profile-password-heading').props.children).toBe('Change password')
    expect(screen.getByTestId('current-password-input').props.placeholder).toBe('Current password')
    expect(screen.getByTestId('new-password-input').props.placeholder).toBe('New password')
  })

  it('shows the idle "Save" label before any submission', async () => {
    await render(<ProfilePassword />)
    expect(screen.getByTestId('profile-password-submit-label').props.children).toBe('Save')
  })

  it('shows no success message before any submission', async () => {
    await render(<ProfilePassword />)
    expect(screen.queryByTestId('profile-password-success')).toBeNull()
  })

  it('changes the password and shows a success message, clearing the fields', async () => {
    mockChangePassword.mockResolvedValue({ data: {}, error: undefined })
    await render(<ProfilePassword />)
    await fireEvent.changeText(screen.getByTestId('current-password-input'), 'old-pw')
    await fireEvent.changeText(screen.getByTestId('new-password-input'), 'new-pw-12345')
    await fireEvent.press(screen.getByTestId('profile-password-submit'))
    await waitFor(() => expect(screen.getByTestId('profile-password-success')).toBeTruthy())
    expect(mockChangePassword).toHaveBeenCalledWith({ current_password: 'old-pw', new_password: 'new-pw-12345' })
    expect(screen.getByTestId('current-password-input').props.value).toBe('')
    expect(screen.getByTestId('new-password-input').props.value).toBe('')
    expect(screen.getByTestId('profile-password-success').props.children).toBe('Password changed.')
  })

  it('falls back to a generic error message when errors is an empty array', async () => {
    mockChangePassword.mockResolvedValue({ data: undefined, error: { errors: [] } })
    await render(<ProfilePassword />)
    await fireEvent.press(screen.getByTestId('profile-password-submit'))
    await waitFor(() => expect(screen.getByTestId('profile-password-error')).toBeTruthy())
    expect(screen.getByTestId('profile-password-error').props.children).toContain('Could not change the password')
  })

  it('shows the server error message when the change fails with one', async () => {
    mockChangePassword.mockResolvedValue({
      data: undefined,
      error: { errors: [{ code: 'incorrect_password', param: 'current_password', message: 'Incorrect password.' }] },
    })
    await render(<ProfilePassword />)
    await fireEvent.press(screen.getByTestId('profile-password-submit'))
    await waitFor(() => expect(screen.getByTestId('profile-password-error')).toBeTruthy())
    expect(screen.getByTestId('profile-password-error').props.children).toBe('Incorrect password.')
    expect(screen.queryByTestId('profile-password-success')).toBeNull()
  })

  it('clears a previous error and success message as soon as a new submission starts', async () => {
    mockChangePassword.mockResolvedValueOnce({
      data: undefined,
      error: { errors: [{ code: 'incorrect_password', message: 'Incorrect password.' }] },
    })
    await render(<ProfilePassword />)
    await fireEvent.press(screen.getByTestId('profile-password-submit'))
    await waitFor(() => expect(screen.getByTestId('profile-password-error')).toBeTruthy())

    let resolveChange: (value: unknown) => void = () => undefined
    mockChangePassword.mockReturnValue(new Promise((resolve) => (resolveChange = resolve)))
    // Not awaited - see "shows a submitting state" below for why.
    fireEvent.press(screen.getByTestId('profile-password-submit'))
    await waitFor(() => expect(screen.queryByTestId('profile-password-error')).toBeNull())
    resolveChange({ data: {}, error: undefined })
    await waitFor(() => expect(screen.getByTestId('profile-password-success')).toBeTruthy())
  })

  it('shows a submitting state while the request is in flight', async () => {
    let resolveChange: (value: unknown) => void = () => undefined
    mockChangePassword.mockReturnValue(new Promise((resolve) => (resolveChange = resolve)))
    await render(<ProfilePassword />)
    // Not awaited: the promise above deliberately never resolves, and fireEvent's own act()
    // wrapper waits for pending work to settle - awaiting it here would hang forever.
    fireEvent.press(screen.getByTestId('profile-password-submit'))
    await waitFor(() => expect(screen.getByText('Saving…')).toBeTruthy())
    resolveChange({ data: {}, error: undefined })
    await waitFor(() => expect(screen.getByTestId('profile-password-success')).toBeTruthy())
  })

  it('re-enables the submit button and resets its label after a failed submission', async () => {
    mockChangePassword.mockResolvedValue({ data: undefined, error: {} })
    await render(<ProfilePassword />)
    await fireEvent.press(screen.getByTestId('profile-password-submit'))
    await waitFor(() => expect(screen.getByTestId('profile-password-error')).toBeTruthy())
    expect(screen.getByTestId('profile-password-submit').props.accessibilityState.disabled).toBe(false)
    expect(screen.getByTestId('profile-password-submit-label').props.children).toBe('Save')
  })

  it('styles the form container', async () => {
    await render(<ProfilePassword />)
    expect(screen.getByTestId('profile-password-form').props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    })
  })

  it('styles the heading', async () => {
    await render(<ProfilePassword />)
    expect(screen.getByTestId('profile-password-heading').props.style).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })

  it('styles the password inputs identically', async () => {
    await render(<ProfilePassword />)
    const expected = { borderWidth: 1, borderRadius: 8, padding: 12 }
    expect(screen.getByTestId('current-password-input').props.style).toEqual(expected)
    expect(screen.getByTestId('new-password-input').props.style).toEqual(expected)
  })

  it('styles the error message red', async () => {
    mockChangePassword.mockResolvedValue({ data: undefined, error: {} })
    await render(<ProfilePassword />)
    await fireEvent.press(screen.getByTestId('profile-password-submit'))
    await waitFor(() => expect(screen.getByTestId('profile-password-error')).toBeTruthy())
    expect(screen.getByTestId('profile-password-error').props.style).toEqual({ color: 'red' })
  })

  it('styles the submit button and its label', async () => {
    await render(<ProfilePassword />)
    expect(screen.getByTestId('profile-password-submit').props.style).toEqual({
      backgroundColor: 'black',
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    })
    expect(screen.getByTestId('profile-password-submit-label').props.style).toEqual({ color: 'white' })
  })
})
