import { ProfileTabsList } from '@/components/app-auth/ProfileTabsList'

import type { Phone } from '@/config/phone'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
let pathname = '/profile/details'
const CONFIG = vi.hoisted(() => ({ OAUTH_PROVIDER: { MODE: 'off' } }))
vi.mock('@/config/public', () => ({ CONFIG }))
const phone = vi.hoisted(() => ({ current: 'none' as Phone }))
vi.mock('@/config/phone', () => ({
  get PHONE() {
    return phone.current
  },
}))

const passwords = vi.hoisted(() => ({ signIn: true }))
vi.mock('@/lib/passwords', () => ({ passwordsSignIn: () => passwords.signIn }))

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}))

describe('ProfileTabsList', () => {
  beforeEach(() => {
    push.mockClear()
    pathname = '/profile/details'
    CONFIG.OAUTH_PROVIDER.MODE = 'off'
    phone.current = 'none'
    passwords.signIn = true
  })

  it('offers the password tab while a password signs in, and not otherwise', () => {
    const { unmount } = render(<ProfileTabsList />)
    expect(screen.getByRole('tab', { name: 'Password' })).toBeTruthy()
    unmount()

    passwords.signIn = false
    render(<ProfileTabsList />)
    expect(screen.queryByRole('tab', { name: 'Password' })).toBeNull()
  })

  it('has no applications tab while the backend is not an OAuth provider', () => {
    render(<ProfileTabsList />)

    expect(screen.queryByRole('tab', { name: 'Apps' })).toBeNull()
  })

  it.each(['approval', 'auto'])('offers the applications tab while the provider is %s', async (mode) => {
    CONFIG.OAUTH_PROVIDER.MODE = mode
    pathname = '/profile/applications'
    render(<ProfileTabsList />)

    expect(screen.getByRole('tab', { name: 'Apps' }).getAttribute('aria-selected')).toBe('true')
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }))
    expect(push).toHaveBeenCalledWith('/profile/details')
  })

  it('has no phone tab while accounts have no numbers', () => {
    render(<ProfileTabsList />)

    expect(screen.queryByRole('tab', { name: 'Phone' })).toBeNull()
  })

  it.each(['optional', 'required'] as const)('offers the phone tab, after emails, while numbers are %s', (mode) => {
    phone.current = mode
    pathname = '/profile/phone'
    render(<ProfileTabsList />)

    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent)
    expect(labels.indexOf('Phone')).toBe(labels.indexOf('Emails') + 1)
    expect(screen.getByRole('tab', { name: 'Phone' }).getAttribute('aria-selected')).toBe('true')
  })

  it('renders every tab, labelled', () => {
    render(<ProfileTabsList />)

    for (const label of ['Details', 'Password', 'Emails', 'Links', 'Sessions', '2FA', 'Tokens']) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy()
    }
  })

  it('marks the tab matching the current path as selected', () => {
    pathname = '/profile/emails'
    render(<ProfileTabsList />)

    expect(screen.getByRole('tab', { name: 'Emails' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('false')
  })

  it('defaults to the first tab when the path matches none of them', () => {
    pathname = '/profile'
    render(<ProfileTabsList />)

    expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true')
  })

  it('does not match a path that only shares a prefix with a tab segment', () => {
    // "details" is the fallback, so only password proves a match.
    pathname = '/profile/password-extra'
    render(<ProfileTabsList />)

    expect(screen.getByRole('tab', { name: 'Password' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true')
  })

  it('navigates to the matching segment when a different tab is clicked', async () => {
    const user = userEvent.setup()
    render(<ProfileTabsList />)

    await user.click(screen.getByRole('tab', { name: 'Sessions' }))

    expect(push).toHaveBeenCalledWith('/profile/sessions')
  })

  it('replaces only the trailing segment when the current path has one', async () => {
    // A trailing segment proves the replace regex's end anchor matters.
    pathname = '/profile/details/nested'
    const user = userEvent.setup()
    render(<ProfileTabsList />)

    await user.click(screen.getByRole('tab', { name: 'Sessions' }))

    expect(push).toHaveBeenCalledWith('/profile/details/nested')
  })

  it('selects and reaches the tokens tab by its own segment, whatever the provider', async () => {
    CONFIG.OAUTH_PROVIDER.MODE = 'off'
    pathname = '/profile/tokens'
    render(<ProfileTabsList />)

    expect(screen.getByRole('tab', { name: 'Tokens' }).getAttribute('aria-selected')).toBe('true')
  })

  it('selects and reaches the notifications tab by its own segment', async () => {
    pathname = '/profile/notifications'
    render(<ProfileTabsList />)

    expect(screen.getByRole('tab', { name: 'Notifications' }).getAttribute('aria-selected')).toBe('true')
  })

  it('selects and reaches the settings tab by its own segment', async () => {
    pathname = '/profile/settings'
    render(<ProfileTabsList />)

    expect(screen.getByRole('tab', { name: 'Settings' }).getAttribute('aria-selected')).toBe('true')
  })

  it('selects and reaches the two-factor tab by its own segment', async () => {
    pathname = '/profile/two-factor'
    const user = userEvent.setup()
    render(<ProfileTabsList />)

    expect(screen.getByRole('tab', { name: '2FA' }).getAttribute('aria-selected')).toBe('true')
    await user.click(screen.getByRole('tab', { name: 'Details' }))
    expect(push).toHaveBeenCalledWith('/profile/details')
  })
})
