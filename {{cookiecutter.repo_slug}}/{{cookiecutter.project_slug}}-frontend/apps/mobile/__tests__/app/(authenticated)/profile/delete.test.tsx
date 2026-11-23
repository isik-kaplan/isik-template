import DeleteAccount from '@/app/(authenticated)/profile/delete'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockDeletion = jest.fn()
const mockRequest = jest.fn()
jest.mock('@/lib/api', () => ({
  getApi: () => ({
    accountDeletion: () => mockDeletion(),
    requestAccountDeletion: (...args: unknown[]) => mockRequest(...args),
  }),
}))
const mockLogout = jest.fn()
jest.mock('@/lib/session', () => ({ getAuthApi: () => ({ logout: () => mockLogout() }) }))
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) } }))

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((settle) => (resolve = settle))
  return { promise, resolve }
}

async function confirming(mode: 'erase' | 'anonymize' = 'erase', afterDays = 14) {
  mockDeletion.mockResolvedValue({ data: { deletion_mode: mode, after_days: afterDays } })
  await render(<DeleteAccount />)
  await waitFor(() => expect(screen.getByTestId('delete-account')).toBeTruthy())
}

describe('DeleteAccount', () => {
  beforeEach(() => jest.clearAllMocks())

  it('waits to be told what deleting does before offering it', async () => {
    mockDeletion.mockReturnValue(new Promise(() => {}))
    await render(<DeleteAccount />)

    expect(screen.getByTestId('delete-account-loading')).toBeTruthy()
  })

  it('shows nothing it hears after the screen has gone', async () => {
    const answer = deferred<unknown>()
    mockDeletion.mockReturnValue(answer.promise)
    const view = await render(<DeleteAccount />)
    await view.unmount()

    answer.resolve({ data: { deletion_mode: 'erase', after_days: 14 } })
    await answer.promise

    expect(screen.queryByTestId('delete-account')).toBeNull()
  })

  it('says what erasing takes and when, and asks nothing until they mean it', async () => {
    await confirming()

    expect(screen.getByTestId('delete-account-heading').props.children).toBe('Delete account')
    expect(screen.getByTestId('delete-account-what').props.children).toBe(
      'Your account and everything in it will be deleted for good, its history included.'
    )
    expect(screen.getByTestId('delete-account-when').props.children).toBe(
      "It happens 14 days after you ask, and you'll be signed out everywhere until then. Signing back in before then cancels it."
    )
    expect(screen.getByTestId('delete-account-start-label').props.children).toBe('Delete my account')
    expect(screen.queryByTestId('delete-account-confirm')).toBeNull()
    expect(screen.queryByTestId('delete-account-error')).toBeNull()
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('says what anonymizing keeps, a day ahead', async () => {
    await confirming('anonymize', 1)

    expect(screen.getByTestId('delete-account-what').props.children).toBe(
      'Your name, addresses and ways to sign in will be deleted for good. What you did here stays, under a nameless account nobody can sign in to.'
    )
    expect(screen.getByTestId('delete-account-when').props.children).toMatch(/^It happens a day after you ask/)
  })

  it('can be backed out of', async () => {
    await confirming()
    await fireEvent.press(screen.getByTestId('delete-account-start'))
    expect(screen.getByTestId('delete-account-keep-label').props.children).toBe('Keep my account')

    await fireEvent.press(screen.getByTestId('delete-account-keep'))

    expect(screen.getByTestId('delete-account-start')).toBeTruthy()
  })

  it('asks once, holding both answers shut, then forgets the session and says when', async () => {
    const asked = deferred<unknown>()
    mockRequest.mockReturnValue(asked.promise)
    mockLogout.mockResolvedValue({})
    await confirming()
    await fireEvent.press(screen.getByTestId('delete-account-start'))
    expect(screen.getByTestId('delete-account-confirm-label').props.children).toBe('Yes, delete my account')

    fireEvent.press(screen.getByTestId('delete-account-confirm'))

    await waitFor(() =>
      expect(screen.getByTestId('delete-account-confirm').props.accessibilityState.disabled).toBe(true)
    )
    expect(screen.getByTestId('delete-account-keep').props.accessibilityState.disabled).toBe(true)
    expect(mockRequest).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/))
    asked.resolve({ data: { deletes_at: '2026-12-07T10:00:00Z' } })
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/deletion-scheduled',
        params: { on: '2026-12-07T10:00:00Z' },
      })
    )
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('stays, says so, and lets them try again when it could not be asked', async () => {
    mockRequest.mockResolvedValueOnce({ data: undefined })
    await confirming()
    await fireEvent.press(screen.getByTestId('delete-account-start'))
    await fireEvent.press(screen.getByTestId('delete-account-confirm'))

    await waitFor(() =>
      expect(screen.getByTestId('delete-account-error').props.children).toBe(
        'Your account could not be scheduled for deletion. Try again.'
      )
    )
    expect(screen.getByTestId('delete-account-confirm').props.accessibilityState.disabled).toBe(false)
    expect(mockLogout).not.toHaveBeenCalled()

    const again = deferred<unknown>()
    mockRequest.mockReturnValueOnce(again.promise)
    fireEvent.press(screen.getByTestId('delete-account-confirm'))
    await waitFor(() => expect(screen.queryByTestId('delete-account-error')).toBeNull())
    again.resolve({ data: undefined })
    await waitFor(() => expect(screen.getByTestId('delete-account-error')).toBeTruthy())
  })
})
