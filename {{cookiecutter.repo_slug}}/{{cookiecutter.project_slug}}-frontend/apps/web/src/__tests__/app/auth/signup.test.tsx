import SignupPage from '@/app/auth/signup/page'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const redirectIfAuthenticated = vi.fn()
vi.mock('@/lib/getSession', () => ({
  redirectIfAuthenticated: (...args: unknown[]) => redirectIfAuthenticated(...args),
  getLanguage: async () => 'en',
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'test-project.test' }) }))
vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'test-project.test' } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/socialProviders', () => ({
  signInProviders: () => [{ id: 'google', name: 'Google', icon: '', adminOnly: false }],
}))
const passwords = vi.hoisted(() => ({ signIn: true }))
vi.mock('@/lib/passwords', () => ({ passwordsSignIn: () => passwords.signIn }))

describe('SignupPage', () => {
  afterEach(() => {
    document.querySelectorAll('form').forEach((form) => form.remove())
    passwords.signIn = true
  })

  it('offers only the providers, and no divider, when nobody signs up with a password', async () => {
    passwords.signIn = false
    render(await SignupPage())

    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign up' })).toBeNull()
    expect(screen.queryByText('Or')).toBeNull()
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/auth/login')
  })

  it('checks whether the visitor is already logged in', async () => {
    render(await SignupPage())

    expect(redirectIfAuthenticated).toHaveBeenCalledWith()
  })

  it('renders the exact title, has-account text, divider text, and a link to log in', async () => {
    render(await SignupPage())

    expect(screen.getByRole('button', { name: 'Sign up' })).toBeTruthy()
    expect(document.querySelector('[data-slot="card-title"]')?.textContent).toBe('Sign up')
    expect(screen.getByText(/Already have an account\?/)).toBeTruthy()
    expect(screen.getByText('Or')).toBeTruthy()
    const loginLink = screen.getByRole('link', { name: 'Log in' })
    expect(loginLink.getAttribute('href')).toBe('/auth/login')
  })

  it('says signing up, by either route, is agreeing to the legal documents', async () => {
    render(await SignupPage())

    expect(screen.getByText(/By continuing, you agree to the/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Terms of Service/ }).getAttribute('href')).toBe('/legal/terms-of-service')
    expect(screen.getByRole('link', { name: /Privacy Policy/ }).getAttribute('href')).toBe('/legal/privacy-policy')
  })

  it('builds the social login action and callback URL from the request origin', async () => {
    HTMLFormElement.prototype.submit = vi.fn()
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }))
    const user = userEvent.setup()
    render(await SignupPage())

    await user.click(screen.getByRole('button', { name: /Continue with Google/ }))

    const forms = document.querySelectorAll('form')
    const socialForm = Array.from(forms).find((form) => form.elements.namedItem('provider'))
    expect(socialForm?.getAttribute('action')).toBe('http://auth.test-project.test/v0/browser/auth/provider/redirect')
    expect((socialForm?.elements.namedItem('callback_url') as HTMLInputElement)?.value).toBe(
      'http://test-project.test/auth/callback-complete?next=%2F'
    )
  })
})
