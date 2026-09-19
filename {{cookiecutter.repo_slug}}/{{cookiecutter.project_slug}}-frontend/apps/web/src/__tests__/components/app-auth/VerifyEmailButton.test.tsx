import { VerifyEmailButton } from '@/components/app-auth/VerifyEmailButton'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    push.mockClear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('shows no error message before the button is ever clicked', () => {
    render(<VerifyEmailButton verificationKey="abc:def" />)

    expect(screen.queryByText('That verification link is no longer valid.')).toBeNull()
  })

  it('redirects home on a 200 (confirmation also completed a pending login)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const user = userEvent.setup()
    render(<VerifyEmailButton verificationKey="abc:def" />)

    await user.click(screen.getByRole('button', { name: 'Confirm email address' }))

    expect(push).toHaveBeenCalledWith('/')
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
  })
})
