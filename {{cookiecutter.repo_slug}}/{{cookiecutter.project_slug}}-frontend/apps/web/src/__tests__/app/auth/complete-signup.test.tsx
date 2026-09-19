import CompleteSignupPage from '@/app/auth/complete-signup/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const pendingProviderSignup = vi.fn()
const AuthApi = vi.hoisted(() => vi.fn())
vi.mock('@{{ cookiecutter.repo_slug }}/auth-api', () => ({ AuthApi }))
AuthApi.mockImplementation(() => ({ pendingProviderSignup }))

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
  it('renders the form with the pending signup data when there is one', async () => {
    pendingProviderSignup.mockResolvedValue({
      data: { data: { user: { email: 'jane@example.test', username: 'jane' } } },
    })

    render(await CompleteSignupPage())

    expect(screen.getByText('Finish setting up your account')).toBeTruthy()
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('jane')
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
