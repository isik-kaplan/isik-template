import ProfileDetails from '@/app/(authenticated)/profile/details'
import { look, themeOf } from '@/theme'

import { render, screen, waitFor } from '@testing-library/react-native'

const LIGHT = themeOf('light')

const mockSession = jest.fn()
jest.mock('@/lib/session', () => ({ getAuthApi: () => ({ session: () => mockSession() }) }))

describe('ProfileDetails', () => {
  beforeEach(() => jest.clearAllMocks())

  it("shows the user's username and email once the session loads", async () => {
    mockSession.mockResolvedValue({ data: { data: { user: { username: 'jane', email: 'jane@test.test' } } } })
    await render(<ProfileDetails />)
    await waitFor(() => expect(screen.getByTestId('profile-details-username').props.children).toBe('jane'))
    expect(screen.getByTestId('profile-details-email').props.children).toBe('jane@test.test')
    expect(screen.getByTestId('profile-details-heading').props.children).toBe('Account details')
    expect(screen.getByText('Username')).toBeTruthy()
    expect(screen.getByText('Email')).toBeTruthy()
  })

  it("shows the user's saved language preference once the session loads", async () => {
    mockSession.mockResolvedValue({
      data: { data: { user: { username: 'jane', email: 'jane@test.test', language: 'en' } } },
    })
    await render(<ProfileDetails />)
    await waitFor(() => expect(screen.getByTestId('profile-details-language').props.children).toBe('en'))
    expect(screen.getByText('Language')).toBeTruthy()
  })

  it('shows the device-default placeholder when the user has no saved preference', async () => {
    mockSession.mockResolvedValue({ data: { data: { user: { username: 'jane', email: 'jane@test.test' } } } })
    await render(<ProfileDetails />)
    await waitFor(() => expect(screen.getByTestId('profile-details-language').props.children).toBe('Device default'))
  })

  it('does not update state after unmount', async () => {
    let resolveSession: (value: unknown) => void = () => undefined
    mockSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)))
    const { unmount } = await render(<ProfileDetails />)
    await unmount()
    resolveSession({ data: { data: { user: { username: 'jane', email: 'jane@test.test' } } } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTestId('profile-details-username')).toBeNull()
  })

  it('styles the screen', async () => {
    mockSession.mockResolvedValue({ data: undefined })
    await render(<ProfileDetails />)
    expect(screen.getByTestId('profile-details').props.contentContainerStyle).toEqual(look.screen())
  })

  it('styles the heading', async () => {
    mockSession.mockResolvedValue({ data: undefined })
    await render(<ProfileDetails />)
    expect(screen.getByTestId('profile-details-heading').props.style).toEqual(look.heading(LIGHT))
  })

  it('styles each detail row', async () => {
    mockSession.mockResolvedValue({ data: { data: { user: { username: 'jane', email: 'jane@test.test' } } } })
    await render(<ProfileDetails />)
    await waitFor(() => expect(screen.getByTestId('profile-details-username-row')).toBeTruthy())
    const expected = look.row(LIGHT)
    expect(screen.getByTestId('profile-details-username-row').props.style).toEqual(expected)
    expect(screen.getByTestId('profile-details-email-row').props.style).toEqual(expected)
  })

  it('leaves out the username row for somebody with no handle', async () => {
    mockSession.mockResolvedValue({ data: { data: { user: { email: 'jane@test.test' } } } })
    await render(<ProfileDetails />)
    await waitFor(() => expect(screen.getByTestId('profile-details-email').props.children).toBe('jane@test.test'))
    expect(screen.queryByTestId('profile-details-username-row')).toBeNull()
    expect(screen.queryByText('Username')).toBeNull()
  })
})
