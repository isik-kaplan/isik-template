import { LogoutButton } from '@/components/app-auth/LogoutButton'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
const refresh = vi.fn()
const broadcastSessionCleared = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

vi.mock('@/lib/sessionChannel', () => ({
  broadcastSessionCleared: () => broadcastSessionCleared(),
}))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('LogoutButton', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200, meta: { is_authenticated: false } }))
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('renders default text and aria-label', () => {
    render(<LogoutButton />)

    const button = screen.getByRole('button', { name: 'Log out' })
    // Both default to the same key, so a role+name query alone can't tell "aria-label" and
    // "visible text" apart - one could silently break while the other keeps the query passing.
    expect(button.getAttribute('aria-label')).toBe('Log out')
    expect(button.textContent).toBe('Log out')
  })

  it('renders custom children when given, leaving the aria-label as the translated default', () => {
    render(<LogoutButton>Sign out everywhere</LogoutButton>)

    const button = screen.getByText('Sign out everywhere')
    expect(button.getAttribute('aria-label')).toBe('Log out')
  })

  it('logs out, broadcasts the cleared session, and navigates home on click', async () => {
    const user = userEvent.setup()
    render(<LogoutButton />)

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(broadcastSessionCleared).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/')
    expect(refresh).toHaveBeenCalled()
  })
})
