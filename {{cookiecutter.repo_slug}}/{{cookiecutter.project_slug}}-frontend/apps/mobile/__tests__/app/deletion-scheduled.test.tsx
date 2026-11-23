import DeletionScheduled from '@/app/deletion-scheduled'

import { fireEvent, render, screen } from '@testing-library/react-native'

const mockReplace = jest.fn()
const mockParams = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockParams(),
}))

describe('DeletionScheduled', () => {
  beforeEach(() => jest.clearAllMocks())

  it('says when, in the app language, and how to keep the account', async () => {
    mockParams.mockReturnValue({ on: '2026-12-07T10:00:00Z' })
    await render(<DeletionScheduled />)

    expect(screen.getByTestId('deletion-scheduled-heading').props.children).toBe('Your account will be deleted')
    expect(screen.getByTestId('deletion-scheduled-body').props.children).toBe(
      "It will be deleted on December 7, 2026, and you've been signed out everywhere until then. Changed your mind? Sign in before then and it stays as it is."
    )
    expect(screen.getByTestId('deletion-scheduled-sign-in-label').props.children).toBe('Sign in to keep my account')

    await fireEvent.press(screen.getByTestId('deletion-scheduled-sign-in'))

    expect(mockReplace).toHaveBeenCalledWith('/login')
  })

  it.each([{}, { on: 'not a date' }])('says it without a date it cannot read: %p', async (params) => {
    mockParams.mockReturnValue(params)
    await render(<DeletionScheduled />)

    expect(screen.getByTestId('deletion-scheduled-body').props.children).toBe(
      "You've been signed out everywhere until it happens. Changed your mind? Sign in before then and it stays as it is."
    )
  })
})
