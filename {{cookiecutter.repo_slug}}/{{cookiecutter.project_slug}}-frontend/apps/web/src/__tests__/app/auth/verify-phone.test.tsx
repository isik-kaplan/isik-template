import VerifyPhonePage from '@/app/auth/verify-phone/page'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('VerifyPhonePage', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('asks for the texted code, with a way back to log in', async () => {
    render(await VerifyPhonePage({ searchParams: Promise.resolve({}) }))

    expect(document.querySelector('[data-slot="card-title"]')?.textContent).toBe('Enter the code we texted you')
    expect(screen.getByText('We sent a code to your phone number. It works for a few minutes.')).toBeTruthy()
    expect(screen.getByLabelText('Code')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to log in' }).getAttribute('href')).toBe('/auth/login')
  })

  it.each([
    ['/dashboard', '/dashboard'],
    ['//evil.test', '/'],
  ])('sends a finished login on to a safe "next" (%s)', async (next, landing) => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    render(await VerifyPhonePage({ searchParams: Promise.resolve({ next }) }))

    await userEvent.type(screen.getByLabelText('Code'), 'ABCD-EFGH')
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(landing))
  })
})
