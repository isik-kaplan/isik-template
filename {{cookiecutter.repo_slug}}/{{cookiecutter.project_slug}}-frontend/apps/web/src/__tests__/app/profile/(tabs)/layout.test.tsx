import ProfileTabsLayout from '@/app/profile/(tabs)/layout'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('@/config/public', () => ({ CONFIG: { OAUTH_PROVIDER: { MODE: 'off' } } }))
vi.mock('@/lib/getSession', () => ({ getSession: () => getSession(), getLanguage: async () => 'en' }))
vi.mock('@/components/app-auth/NotificationBell', () => ({ NotificationBell: () => <p>bell</p> }))
vi.mock('@/components/app-search/CommandPalette', () => ({ CommandPalette: () => <p>palette</p> }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile/details',
}))

describe('ProfileTabsLayout', () => {
  it('renders nothing when there is no session', async () => {
    getSession.mockResolvedValue(null)

    const result = await ProfileTabsLayout({ children: <p>content</p> })

    expect(result).toBeNull()
  })

  it('renders the account label, email, tabs and children for a logged-in visitor', async () => {
    getSession.mockResolvedValue({ user: { id: '1', username: 'jd', display: 'Jane Doe', email: 'jane@test.test' } })

    render(await ProfileTabsLayout({ children: <p>content</p> }))

    expect(screen.getByText('Jane Doe')).toBeTruthy()
    expect(screen.queryByText('jd')).toBeNull()
    const email = screen.getByText('jane@test.test')
    expect(email.tagName).toBe('P')
    expect(email.className).toContain('text-muted-foreground')
    expect(screen.getByText('content')).toBeTruthy()
    expect(screen.getByText('JD')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
    expect(screen.getByText('bell')).toBeTruthy()
    expect(screen.getByText('palette')).toBeTruthy()
  })

  it('omits the email line when the session has none', async () => {
    getSession.mockResolvedValue({ user: { id: '1', display: 'jane', email: '' } })

    render(await ProfileTabsLayout({ children: <p>content</p> }))

    expect(screen.queryByText('jane@test.test')).toBeNull()
  })
})
