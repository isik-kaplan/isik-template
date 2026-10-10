import CompleteSignupPage from '@/app/auth/complete-signup/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pendingProviderSignup = vi.fn()
const AuthApi = vi.hoisted(() => vi.fn())
vi.mock('@{{ cookiecutter.repo_slug }}/auth-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  AuthApi,
}))
// session(), not just pendingProviderSignup: getLanguage() (called by this page's own
// sUseTranslation, via '@/lib/getSession', not mocked here) constructs its own AuthApi too.
AuthApi.mockImplementation(() => ({ pendingProviderSignup, session: vi.fn().mockResolvedValue({}) }))

// The request's host below is only taken as this deployment's origin when it is the configured domain.
vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'test-project.test' } }))

let cookieHeader: string | undefined = 'sessionid=abc123'
vi.mock('next/headers', () => ({
  headers: async () => {
    const init: Record<string, string> = { host: 'test-project.test' }
    if (cookieHeader !== undefined) init.cookie = cookieHeader
    return new Headers(init)
  },
}))
// redirect() interrupts rendering in real Next.js - mocked to throw here too, since the source
// has no early `return` after calling it and relies on that to stop reaching the code below.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  useRouter: () => ({ push: vi.fn() }),
}))

describe('CompleteSignupPage', () => {
  // Without this, a call recorded by an earlier test (getLanguage()'s own AuthApi construction,
  // reached only on the non-redirect path) lingers in AuthApi's shared call history and can
  // satisfy a later test's toHaveBeenCalledWith on its own, regardless of what this page's own
  // constructor call actually passed.
  beforeEach(() => AuthApi.mockClear())

  it('renders the form with the pending signup data when there is one', async () => {
    pendingProviderSignup.mockResolvedValue({
      data: { data: { user: { email: 'jane@example.test', username: 'jane' } } },
    })

    render(await CompleteSignupPage())

    expect(screen.getByText('Finish setting up your account')).toBeTruthy()
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('jane')
  })

  it('says finishing a social signup is agreeing to the legal documents', async () => {
    pendingProviderSignup.mockResolvedValue({
      data: { data: { user: { email: 'jane@example.test', username: 'jane' } } },
    })

    render(await CompleteSignupPage())

    expect(screen.getByText(/By continuing, you agree to the/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Privacy Policy/ }).getAttribute('href')).toBe('/legal/privacy-policy')
  })

  it('redirects to login when there is no pending signup', async () => {
    pendingProviderSignup.mockResolvedValue({ data: undefined })

    await expect(CompleteSignupPage()).rejects.toThrow('REDIRECT:/auth/login')
  })

  it('builds the AuthApi client from the request origin, forwarding the incoming cookie header', async () => {
    pendingProviderSignup.mockResolvedValue({ data: undefined })

    await expect(CompleteSignupPage()).rejects.toThrow('REDIRECT:/auth/login')

    expect(AuthApi).toHaveBeenCalledWith('http://auth.test-project.test', { cookieHeader: 'sessionid=abc123' })
  })

  it('defaults cookieHeader to undefined when the request carries no cookie', async () => {
    pendingProviderSignup.mockResolvedValue({ data: undefined })
    cookieHeader = undefined

    await expect(CompleteSignupPage()).rejects.toThrow('REDIRECT:/auth/login')

    expect(AuthApi).toHaveBeenCalledWith('http://auth.test-project.test', { cookieHeader: undefined })
    cookieHeader = 'sessionid=abc123'
  })
})
