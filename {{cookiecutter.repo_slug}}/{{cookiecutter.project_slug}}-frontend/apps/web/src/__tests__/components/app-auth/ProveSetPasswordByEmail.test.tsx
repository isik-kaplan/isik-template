import { ProveSetPasswordByEmail } from '@/components/app-auth/ProveSetPasswordByEmail'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('ProveSetPasswordByEmail', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('mails a link to set a password to their own address, and says where it went', async () => {
    document.cookie = 'csrftoken=token'
    let release: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
    const user = userEvent.setup()
    render(<ProveSetPasswordByEmail email="alice@example.test" />)

    expect(
      screen.getByText(
        'Your account has no password yet. We can email you a link to set one, and you can confirm with it afterwards.'
      )
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Email me a link to set a password' }))

    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    release(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    expect(
      await screen.findByText(
        'We sent a link to alice@example.test. Set a password there, then come back to confirm with it.'
      )
    ).toBeTruthy()
    const [request] = vi.mocked(globalThis.fetch).mock.calls[0] as [Request]
    expect(request.url).toContain('/v0/browser/v1/auth/password/request')
    expect(await request.json()).toEqual({ email: 'alice@example.test' })
  })
})
