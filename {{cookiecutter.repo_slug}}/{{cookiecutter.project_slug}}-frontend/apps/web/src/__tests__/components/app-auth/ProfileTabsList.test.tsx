import { ProfileTabsList } from '@/components/app-auth/ProfileTabsList'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
let pathname = '/profile/details'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}))

describe('ProfileTabsList', () => {
  beforeEach(() => {
    push.mockClear()
    pathname = '/profile/details'
  })

  it('renders every tab, labelled', () => {
    render(<ProfileTabsList />)

    for (const label of ['Details', 'Password', 'Emails', 'Links', 'Sessions']) {
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
    // "details" is the default fallback, so a path this doesn't match at all would show it
    // selected too - password isn't the default, so only a wrongful match would select it.
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
    // A pathname with something after the segment (not a route this app has today, but the
    // replace regex is anchored to the end for exactly this case) proves the anchor matters:
    // an unanchored regex would instead rewrite the first /profile/<segment> it finds.
    pathname = '/profile/details/nested'
    const user = userEvent.setup()
    render(<ProfileTabsList />)

    await user.click(screen.getByRole('tab', { name: 'Sessions' }))

    expect(push).toHaveBeenCalledWith('/profile/details/nested')
  })
})
