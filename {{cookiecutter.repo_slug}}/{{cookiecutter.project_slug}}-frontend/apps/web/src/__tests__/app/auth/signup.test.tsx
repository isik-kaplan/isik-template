import SignupPage from '@/app/auth/signup/page'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const redirectIfAuthenticated = vi.fn()
vi.mock('@/lib/getSession', () => ({
  redirectIfAuthenticated: (...args: unknown[]) => redirectIfAuthenticated(...args),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'test-project.test' }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/socialProviders', () => ({ SOCIAL_PROVIDERS: [{ id: 'google', name: 'Google', icon: '' }] }))

describe('SignupPage', () => {
  afterEach(() => {
    document.querySelectorAll('form').forEach((form) => form.remove())
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

  it('builds the social login action and callback URL from the request origin', async () => {
    HTMLFormElement.prototype.submit = vi.fn()
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }))
    const user = userEvent.setup()
    render(await SignupPage())

    await user.click(screen.getByRole('button', { name: /Continue with Google/ }))

    const forms = document.querySelectorAll('form')
    const socialForm = Array.from(forms).find((form) => form.elements.namedItem('provider'))
    expect(socialForm?.getAttribute('action')).toBe(
      'http://auth.test-project.test/v0/browser/v1/auth/provider/redirect'
    )
    expect((socialForm?.elements.namedItem('callback_url') as HTMLInputElement)?.value).toBe(
      'http://test-project.test/auth/callback-complete?next=%2F'
    )
  })
})
