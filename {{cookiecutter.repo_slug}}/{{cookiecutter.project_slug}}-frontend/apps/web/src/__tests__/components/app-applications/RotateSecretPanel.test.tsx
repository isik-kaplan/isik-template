import { RotateSecretPanel } from '@/components/app-applications/RotateSecretPanel'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** The Idempotency-Key each request so far carried, in order. */
function keysSent(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([request]) => (request as Request).headers.get('Idempotency-Key'))
}

/** Answers with each status in turn. */
function answering(...statuses: number[]) {
  return vi.fn(async () => jsonResponse(statuses.shift()!, { client_secret: 'a-secret' }))
}

/** A page served over plain http, as the e2e stack's is: the browser has no crypto.randomUUID there. */
function withoutRandomUUID() {
  const real = globalThis.crypto
  vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
}

describe('RotateSecretPanel', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
  })

  it('makes a new secret, leaving the tokens alone unless asked, and shows it once', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { client_secret: 'the-new-secret' }))
    globalThis.fetch = fetchMock
    render(<RotateSecretPanel applicationId={7} clientId="the-client" />)

    expect(screen.getByText(/Make a new secret for the same client ID/)).toBeTruthy()
    expect(screen.queryByText('the-new-secret')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Make a new secret' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/v0/oauth-applications/7/rotate-secret/')
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()
    expect(await request.json()).toEqual({ revoke_tokens: false })
    expect(screen.getByText('the-new-secret')).toBeTruthy()
    expect(screen.getByText('the-client')).toBeTruthy()
  })

  it('signs everybody out with it when asked', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { client_secret: 'the-new-secret' }))
    globalThis.fetch = fetchMock
    render(<RotateSecretPanel applicationId={7} clientId="the-client" />)

    await userEvent.click(screen.getByRole('checkbox', { name: /Also sign everybody out/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Make a new secret' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(await request.json()).toEqual({ revoke_tokens: true })
  })

  it('makes one on a page without crypto.randomUUID', async () => {
    withoutRandomUUID()
    const fetchMock = answering(200)
    globalThis.fetch = fetchMock
    render(<RotateSecretPanel applicationId={7} clientId="the-client" />)

    await userEvent.click(screen.getByRole('button', { name: 'Make a new secret' }))

    expect(keysSent(fetchMock)).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/)])
    expect(screen.getByText('a-secret')).toBeTruthy()
  })

  it('retries under the same key, and makes a new one when asked otherwise or once it went through', async () => {
    const fetchMock = answering(500, 500, 200, 200)
    globalThis.fetch = fetchMock
    render(<RotateSecretPanel applicationId={7} clientId="the-client" />)

    const rotate = () => userEvent.click(screen.getByRole('button', { name: 'Make a new secret' }))
    await rotate()
    await rotate()
    await userEvent.click(screen.getByRole('checkbox', { name: /Also sign everybody out/ }))
    await rotate()
    await rotate()

    const [first, retry, revoking, again] = keysSent(fetchMock)
    expect(retry).toBe(first)
    expect(revoking).not.toBe(first)
    expect(again).not.toBe(revoking)
  })

  it('says so when no new secret could be made', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<RotateSecretPanel applicationId={7} clientId="the-client" />)

    await userEvent.click(screen.getByRole('button', { name: 'Make a new secret' }))

    expect(toast.error).toHaveBeenCalledWith('Could not make a new secret.')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('holds the button while it is out', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}))
    render(<RotateSecretPanel applicationId={7} clientId="the-client" />)

    await userEvent.click(screen.getByRole('button', { name: 'Make a new secret' }))

    expect((screen.getByRole('button', { name: 'Make a new secret' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
