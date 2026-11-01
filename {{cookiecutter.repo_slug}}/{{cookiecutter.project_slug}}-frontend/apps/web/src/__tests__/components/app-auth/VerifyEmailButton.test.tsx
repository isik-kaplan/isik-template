import { VerifyEmailButton } from '@/components/app-auth/VerifyEmailButton'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('VerifyEmailButton', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    // A token already set skips the CSRF prime, so the one fetch held open is the write itself.
    document.cookie = 'csrftoken=token'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('shows no error message before the button is ever clicked', () => {
    const { container } = render(<VerifyEmailButton verificationKey="abc:def" />)

    expect(screen.queryByText('That verification link is no longer valid.')).toBeNull()
    expect(container.querySelector('p')).toBeNull()
  })

  it('redirects home on a 200 (confirmation also completed a pending login)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const user = userEvent.setup()
    render(<VerifyEmailButton verificationKey="abc:def" />)

    await user.click(screen.getByRole('button', { name: 'Confirm email address' }))

    expect(push).toHaveBeenCalledWith('/')
    // The screen is leaving, so the button stays shut rather than spending the key twice.
    expect(screen.getByRole('button', { name: 'Confirm email address' })).toHaveProperty('disabled', true)
  })

  it('keeps the button shut while the confirmation is in flight', async () => {
    let answer: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)))
    const user = userEvent.setup()
    render(<VerifyEmailButton verificationKey="abc:def" />)

    await user.click(screen.getByRole('button', { name: 'Confirm email address' }))
    await user.click(screen.getByRole('button', { name: 'Confirm email address' }))

    expect(screen.getByRole('button', { name: 'Confirm email address' })).toHaveProperty('disabled', true)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
    answer(jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  it('redirects to login on a 401 with no errors array (valid key, separate login required)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { status: 401, data: { flows: [{ id: 'login' }] }, meta: { is_authenticated: false } })
    )
    const user = userEvent.setup()
    render(<VerifyEmailButton verificationKey="abc:def" />)

    await user.click(screen.getByRole('button', { name: 'Confirm email address' }))

    expect(push).toHaveBeenCalledWith('/auth/login')
  })

  it('shows an error message on an actually invalid/expired key', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'invalid_key', message: 'That key has expired.' }] })
    )
    const user = userEvent.setup()
    render(<VerifyEmailButton verificationKey="abc:def" />)

    await user.click(screen.getByRole('button', { name: 'Confirm email address' }))

    expect(await screen.findByText('That verification link is no longer valid.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm email address' })).toHaveProperty('disabled', false)
  })

  it('says to wait rather than going on as if confirmed, when refused for coming too often', async () => {
    // allauth's refusal carries neither a Retry-After nor an `errors` list.
    globalThis.fetch = vi.fn(async () => jsonResponse(429, { status: 429 }))
    const user = userEvent.setup()
    render(<VerifyEmailButton verificationKey="abc:def" />)

    await user.click(screen.getByRole('button'))

    expect(await screen.findByText('Too many requests. Wait a moment, then try again.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('names the wait when the refusal says how long', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 429, headers: { 'Retry-After': '30' } }))
    const user = userEvent.setup()
    render(<VerifyEmailButton verificationKey="abc:def" />)

    await user.click(screen.getByRole('button'))

    expect(await screen.findByText('Too many requests. Try again in 30 seconds.')).toBeTruthy()
  })
})
