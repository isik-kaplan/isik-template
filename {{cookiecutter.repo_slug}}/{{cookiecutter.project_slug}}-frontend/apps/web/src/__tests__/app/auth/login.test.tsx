import LoginPage from '@/app/auth/login/page'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const redirectIfAuthenticated = vi.fn()
vi.mock('@/lib/getSession', () => ({
  redirectIfAuthenticated: (...args: unknown[]) => redirectIfAuthenticated(...args),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'test-project.test' }) }))
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('@/lib/socialProviders', () => ({ SOCIAL_PROVIDERS: [{ id: 'google', name: 'Google', icon: '' }] }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('LoginPage', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    push.mockClear()
    document.querySelectorAll('form').forEach((form) => form.remove())
  })

  it('checks whether the visitor is already logged in, redirecting to "next" if given', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ next: '/dashboard' }) }))

    expect(redirectIfAuthenticated).toHaveBeenCalledWith('/dashboard')
  })

  it('defaults the redirect target to "/" when no next param is given', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }))

    expect(redirectIfAuthenticated).toHaveBeenCalledWith('/')
  })

  it('renders the exact title, no-account text, divider text, and links to sign up and reset', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }))

    expect(document.querySelector('[data-slot="card-title"]')?.textContent).toBe('Log in')
    expect(screen.getByText(/Don't have an account\?/)).toBeTruthy()
    expect(screen.getByText('Or')).toBeTruthy()
    const signupLink = screen.getByRole('link', { name: 'Sign up' })
    expect(signupLink.getAttribute('href')).toBe('/auth/signup')
    const forgotLink = screen.getByRole('link', { name: 'Forgot your password?' })
    expect(forgotLink.getAttribute('href')).toBe('/auth/forgot-password')
  })

  it('builds the social login action and callback URL from the request origin and "next"', async () => {
    HTMLFormElement.prototype.submit = vi.fn()
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }))
    const user = userEvent.setup()
    render(await LoginPage({ searchParams: Promise.resolve({ next: '/dashboard' }) }))

    await user.click(screen.getByRole('button', { name: /Continue with Google/ }))

    const forms = document.querySelectorAll('form')
    const socialForm = Array.from(forms).find((form) => form.elements.namedItem('provider'))
    expect(socialForm?.getAttribute('action')).toBe(
      'http://auth.test-project.test/v0/browser/v1/auth/provider/redirect'
    )
    expect((socialForm?.elements.namedItem('callback_url') as HTMLInputElement)?.value).toBe(
      'http://test-project.test/auth/callback-complete?next=%2Fdashboard'
    )
  })

  it('defaults the callback URL\'s "next" to "/" when none is given', async () => {
    HTMLFormElement.prototype.submit = vi.fn()
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }))
    const user = userEvent.setup()
    render(await LoginPage({ searchParams: Promise.resolve({}) }))

    await user.click(screen.getByRole('button', { name: /Continue with Google/ }))

    const forms = document.querySelectorAll('form')
    const socialForm = Array.from(forms).find((form) => form.elements.namedItem('provider'))
    expect((socialForm?.elements.namedItem('callback_url') as HTMLInputElement)?.value).toBe(
      'http://test-project.test/auth/callback-complete?next=%2F'
    )
  })

  it('passes "next" through to the login form as its post-login redirect target', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const user = userEvent.setup()
    render(await LoginPage({ searchParams: Promise.resolve({ next: '/dashboard' }) }))

    await user.type(screen.getByLabelText('Username or email'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('defaults the login form\'s redirect target to "/" when no "next" is given', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const user = userEvent.setup()
    render(await LoginPage({ searchParams: Promise.resolve({}) }))

    await user.type(screen.getByLabelText('Username or email'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(push).toHaveBeenCalledWith('/')
  })
})
