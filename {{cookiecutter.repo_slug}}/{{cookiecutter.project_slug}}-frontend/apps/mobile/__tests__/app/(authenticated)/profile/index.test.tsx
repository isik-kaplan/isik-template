import Profile from '@/app/(authenticated)/profile/index'

import { fireEvent, render, screen } from '@testing-library/react-native'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }))

describe('Profile', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows the heading', async () => {
    await render(<Profile />)
    expect(screen.getByTestId('profile-heading').props.children).toBe('Profile')
  })

  it.each([
    ['profile-details-link', '/profile/details', 'Account details'],
    ['profile-emails-link', '/profile/emails', 'Email addresses'],
{%- if cookiecutter.phone != "none" %}
    ['profile-phone-link', '/profile/phone', 'Phone number'],
{%- endif %}
    ['profile-password-link', '/profile/password', 'Change password'],
    ['profile-connections-link', '/profile/connections', 'Connected accounts'],
    ['profile-sessions-link', '/profile/sessions', 'Active sessions'],
    ['profile-delete-link', '/profile/delete', 'Delete account'],
  ])('shows the right label for %s and navigates to %s', async (testID, href, label) => {
    await render(<Profile />)
    expect(screen.getByText(label)).toBeTruthy()
    await fireEvent.press(screen.getByTestId(testID))
    expect(mockPush).toHaveBeenCalledWith(href)
  })
})

describe('Profile without passwords', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY = 'true'
  })
  afterEach(() => {
    process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY = 'false'
  })

  it('offers no password to change', async () => {
    await render(<Profile />)

    expect(screen.queryByTestId('profile-password-link')).toBeNull()
    expect(screen.getByTestId('profile-emails-link')).toBeTruthy()
  })
})
