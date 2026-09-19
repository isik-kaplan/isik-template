import HomePage from '@/app/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('@/lib/getSession', () => ({ getSession: (...args: unknown[]) => getSession(...args) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

describe('HomePage', () => {
  it('greets a logged-in visitor by username, with a logout button', async () => {
    getSession.mockResolvedValue({ user: { id: '1', username: 'jane', email: 'jane@test.test' } })

    render(await HomePage())

    expect(screen.getByText(/jane/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('{{ cookiecutter.project_name }}')
  })

  it('offers login and signup links to an anonymous visitor', async () => {
    getSession.mockResolvedValue(null)

    render(await HomePage())

    const loginLink = screen.getByRole('link', { name: 'Log in' })
    expect(loginLink.getAttribute('href')).toBe('/auth/login')
    const signupLink = screen.getByRole('link', { name: 'Sign up' })
    expect(signupLink.getAttribute('href')).toBe('/auth/signup')
  })
})
