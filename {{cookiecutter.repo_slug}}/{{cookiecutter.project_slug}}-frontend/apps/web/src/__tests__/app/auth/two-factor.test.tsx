import TwoFactorPage from '@/app/auth/two-factor/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSessionState = vi.fn()
vi.mock('@/lib/getSession', () => ({ getSessionState: () => getSessionState(), getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

async function redirectedTo(page: Promise<unknown>): Promise<string> {
  try {
    await page
  } catch (thrown) {
    if (thrown instanceof Error && thrown.message.startsWith('REDIRECT:')) {
      return thrown.message.slice('REDIRECT:'.length)
    }
    throw thrown
  }
  throw new Error('expected a redirect, got none')
}

describe('TwoFactorPage', () => {
  beforeEach(() => {
    getSessionState.mockReset()
  })

  it('asks for the factor a pending login still owes', async () => {
    getSessionState.mockResolvedValue({ session: null, pendingMfaTypes: ['totp', 'recovery_codes'] })

    render(await TwoFactorPage({ searchParams: Promise.resolve({ next: '/dashboard' }) }))

    expect(document.querySelector('[data-slot="card-title"]')?.textContent).toBe('Two-factor authentication')
    expect(screen.getByRole('group', { name: 'Authentication code' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to log in' }).getAttribute('href')).toBe('/auth/login')
  })

  it('sends a visitor who is already logged in on to a safe "next"', async () => {
    getSessionState.mockResolvedValue({ session: { user: {} }, pendingMfaTypes: null })

    expect(await redirectedTo(TwoFactorPage({ searchParams: Promise.resolve({ next: '/dashboard' }) }))).toBe(
      '/dashboard'
    )
  })

  it('never redirects off-site, whatever "next" says', async () => {
    getSessionState.mockResolvedValue({ session: { user: {} }, pendingMfaTypes: null })

    expect(await redirectedTo(TwoFactorPage({ searchParams: Promise.resolve({ next: '//evil.test' }) }))).toBe('/')
  })

  it('sends a visitor with nothing pending back to log in', async () => {
    getSessionState.mockResolvedValue({ session: null, pendingMfaTypes: null })

    expect(await redirectedTo(TwoFactorPage({ searchParams: Promise.resolve({}) }))).toBe('/auth/login')
  })
})
