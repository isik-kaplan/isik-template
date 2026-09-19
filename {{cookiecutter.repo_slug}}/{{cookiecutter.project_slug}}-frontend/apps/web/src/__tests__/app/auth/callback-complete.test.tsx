import CallbackCompletePage from '@/app/auth/callback-complete/page'

import { describe, expect, it, vi } from 'vitest'

const getSessionState = vi.fn()
vi.mock('@/lib/getSession', () => ({ getSessionState: () => getSessionState() }))
// redirect() interrupts rendering in real Next.js - mocked to throw here too, so this page's own
// fall-through logic (or lack of one) is exercised the same way it is in production.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

function searchParams(params: Record<string, string | string[]> = {}) {
  return Promise.resolve(params)
}

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

describe('CallbackCompletePage', () => {
  it('sends a pending provider signup to complete-signup', async () => {
    getSessionState.mockResolvedValue({ session: null, pendingProviderSignup: true })

    const to = await redirectedTo(CallbackCompletePage({ searchParams: searchParams() }))

    expect(to).toBe('/auth/complete-signup')
  })

  it('sends a logged-in visitor to a safe "next" target', async () => {
    getSessionState.mockResolvedValue({
      session: { user: { id: '1', username: 'jane', email: 'j@test.test' } },
      pendingProviderSignup: false,
    })

    const to = await redirectedTo(CallbackCompletePage({ searchParams: searchParams({ next: '/dashboard' }) }))

    expect(to).toBe('/dashboard')
  })

  it('sends a logged-out visitor with no error param to login', async () => {
    getSessionState.mockResolvedValue({ session: null, pendingProviderSignup: false })

    const to = await redirectedTo(CallbackCompletePage({ searchParams: searchParams() }))

    expect(to).toBe('/auth/login')
  })

  it('forwards a real provider error to provider-error, with its process', async () => {
    getSessionState.mockResolvedValue({ session: null, pendingProviderSignup: false })

    const to = await redirectedTo(
      CallbackCompletePage({ searchParams: searchParams({ error: 'cancelled', error_process: 'connect' }) })
    )

    expect(to).toBe('/auth/provider-error?error=cancelled&error_process=connect')
  })

  it('takes the first value when a param repeats', async () => {
    getSessionState.mockResolvedValue({ session: null, pendingProviderSignup: false })

    const to = await redirectedTo(CallbackCompletePage({ searchParams: searchParams({ error: ['a', 'b'] }) }))

    expect(to).toBe('/auth/provider-error?error=a')
  })

  it('takes the first value when error_process repeats too', async () => {
    getSessionState.mockResolvedValue({ session: null, pendingProviderSignup: false })

    const to = await redirectedTo(
      CallbackCompletePage({ searchParams: searchParams({ error: 'cancelled', error_process: ['connect', 'x'] }) })
    )

    expect(to).toBe('/auth/provider-error?error=cancelled&error_process=connect')
  })
})
