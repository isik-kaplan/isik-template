import HomePage from '@/app/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('@/lib/getSession', () => ({
  getSession: (...args: unknown[]) => getSession(...args),
  getLanguage: async () => 'en',
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const CONFIG = vi.hoisted(() => ({ OAUTH_PROVIDER: { MODE: 'approval' } }))
vi.mock('@/config/public', () => ({ CONFIG }))
const me = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me }) }))

const JANE = { user: { id: '1', username: 'jane', email: 'jane@test.test' } }

function asked(fields: { is_staff?: boolean; is_superuser?: boolean; permissions?: string[] } = {}) {
  me.mockResolvedValue({ data: { is_staff: false, is_superuser: false, permissions: [], ...fields } })
}

const links = () => screen.queryAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    CONFIG.OAUTH_PROVIDER.MODE = 'approval'
  })

  it('greets a logged-in visitor by username, with a logout button', async () => {
    getSession.mockResolvedValue(JANE)
    asked()

    render(await HomePage())

    expect(screen.getByText(/jane/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('{{ cookiecutter.project_name }}')
  })

  it('leads anybody signed in to their profile and their apps', async () => {
    getSession.mockResolvedValue(JANE)
    asked()

    render(await HomePage())

    expect(links()).toEqual([
      ['Your profile', '/profile'],
      ['Your apps', '/applications'],
    ])
  })

  it('leaves the apps out while there are none here', async () => {
    getSession.mockResolvedValue(JANE)
    asked({ is_superuser: true, is_staff: true })
    CONFIG.OAUTH_PROVIDER.MODE = 'off'

    render(await HomePage())

    expect(links()).toEqual([
      ['Your profile', '/profile'],
      ['People', '/staff/people'],
    ])
  })

  it('leads whoever reads everybody to the people, and a superuser to the app approvals', async () => {
    getSession.mockResolvedValue(JANE)
    asked({ is_superuser: true, permissions: ['users:manage:user'] })

    render(await HomePage())

    expect(links()).toEqual([
      ['Your profile', '/profile'],
      ['Your apps', '/applications'],
      ['People', '/staff/people'],
      ['App approvals', '/staff/applications'],
    ])
  })

  it('leaves out what it could not ask the backend about', async () => {
    getSession.mockResolvedValue(JANE)
    me.mockResolvedValue({ data: undefined })

    render(await HomePage())

    expect(links()).toEqual([
      ['Your profile', '/profile'],
      ['Your apps', '/applications'],
    ])
  })

  it('offers login and signup links to an anonymous visitor', async () => {
    getSession.mockResolvedValue(null)

    render(await HomePage())

    expect(me).not.toHaveBeenCalled()

    const loginLink = screen.getByRole('link', { name: 'Log in' })
    expect(loginLink.getAttribute('href')).toBe('/auth/login')
    const signupLink = screen.getByRole('link', { name: 'Sign up' })
    expect(signupLink.getAttribute('href')).toBe('/auth/signup')
  })
})
