import { DeleteAccount } from '@/components/app-auth/DeleteAccount'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const broadcastSessionCleared = vi.fn()
vi.mock('@/lib/sessionChannel', () => ({ broadcastSessionCleared: () => broadcastSessionCleared() }))

const ERASE = { deletion_mode: 'erase' as const, after_days: 14 }
const ANONYMIZE_TOMORROW = { deletion_mode: 'anonymize' as const, after_days: 1 }

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('DeleteAccount', () => {
  const originalFetch = globalThis.fetch
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    document.cookie = 'csrftoken=token'
    const standIn = { href: '', origin: originalLocation.origin, pathname: '/profile/details', search: '' }
    Object.defineProperty(window, 'location', { value: standIn, writable: true })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('says what erasing takes and when, and asks nothing until they mean it', () => {
    globalThis.fetch = vi.fn()
    render(<DeleteAccount deletion={ERASE} />)

    expect(screen.getByRole('heading', { name: 'Delete account' })).toBeTruthy()
    expect(
      screen.getByText('Your account and everything in it will be deleted for good, its history included.')
    ).toBeTruthy()
    expect(
      screen.getByText(
        "It happens 14 days after you ask, and you'll be signed out everywhere until then. Signing back in before then cancels it."
      )
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Yes, delete my account' })).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('says what anonymizing keeps, a day ahead', () => {
    render(<DeleteAccount deletion={ANONYMIZE_TOMORROW} />)

    expect(
      screen.getByText(
        'Your name, addresses and ways to sign in will be deleted for good. What you did here stays, under a nameless account nobody can sign in to.'
      )
    ).toBeTruthy()
    expect(screen.getByText(/^It happens a day after you ask/)).toBeTruthy()
  })

  it('can be backed out of', async () => {
    const user = userEvent.setup()
    render(<DeleteAccount deletion={ERASE} />)

    await user.click(screen.getByRole('button', { name: 'Delete my account' }))
    await user.click(screen.getByRole('button', { name: 'Keep my account' }))

    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeTruthy()
  })

  it('asks once, holding both answers shut, then signs every tab out and says when', async () => {
    let answer!: (response: Response) => void
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)))
    const user = userEvent.setup()
    render(<DeleteAccount deletion={ERASE} />)

    await user.click(screen.getByRole('button', { name: 'Delete my account' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete my account' }))

    expect(screen.getByRole('button', { name: 'Yes, delete my account' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Keep my account' })).toHaveProperty('disabled', true)
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledOnce())
    const [request] = vi.mocked(globalThis.fetch).mock.calls[0] as [Request]
    expect([request.method, new URL(request.url).pathname]).toEqual(['POST', '/v0/users/me/deletion/'])
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()

    answer(jsonResponse(202, { deletes_at: '2026-12-07T10:00:00Z' }))
    await vi.waitFor(() =>
      expect(window.location.href).toBe(
        `${originalLocation.origin}/auth/deletion-scheduled?on=2026-12-07T10%3A00%3A00Z`
      )
    )
    expect(broadcastSessionCleared).toHaveBeenCalledOnce()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('stays, and says so, when it could not be asked', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(500, {}))
    const user = userEvent.setup()
    render(<DeleteAccount deletion={ERASE} />)

    await user.click(screen.getByRole('button', { name: 'Delete my account' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete my account' }))

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Your account could not be scheduled for deletion. Try again.')
    )
    expect(screen.getByRole('button', { name: 'Yes, delete my account' })).toHaveProperty('disabled', false)
    expect(window.location.href).toBe('')
    expect(broadcastSessionCleared).not.toHaveBeenCalled()
  })
})
