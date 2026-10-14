import { DeviceConsent } from '@/components/app-device/DeviceConsent'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/** The Idempotency-Key each request so far carried, in order. */
function keysSent(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([request]) => (request as Request).headers.get('Idempotency-Key'))
}

/** Answers with each status in turn. */
function answering(...statuses: number[]) {
  return vi.fn(async () => new Response(null, { status: statuses.shift() }))
}

describe('DeviceConsent', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it.each([
    ['Allow', 'approve', 'Done. Go back to your device: it is signed in.'],
    ['Deny', 'deny', 'Turned away. The device was told no.'],
  ])('answers %s for the code, and then only says what happened', async (button, action, said) => {
    const fetchMock = answering(204)
    globalThis.fetch = fetchMock
    render(<DeviceConsent userCode="BCDFGHJK" />)

    await userEvent.click(screen.getByRole('button', { name: button }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe(`/v0/device-authorizations/BCDFGHJK/${action}/`)
    expect(keysSent(fetchMock)[0]).toBeTruthy()
    expect((await screen.findByRole('status')).textContent).toBe(said)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each(['Allow', 'Deny'])('says so when %s could not be answered, and lets it be tried again', async (button) => {
    const fetchMock = answering(500, 204)
    globalThis.fetch = fetchMock
    render(<DeviceConsent userCode="BCDFGHJK" />)

    await userEvent.click(screen.getByRole('button', { name: button }))

    expect(toast.error).toHaveBeenCalledWith('Could not answer the device. Start again on it.')
    expect(screen.queryByRole('status')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: button }))

    // The same answer, so the backend can tell a retry from a second one.
    const [first, second] = keysSent(fetchMock)
    expect(second).toBe(first)
    expect(await screen.findByRole('status')).toBeTruthy()
  })

  it('answers allowing and denying under keys of their own', async () => {
    const fetchMock = answering(500, 204)
    globalThis.fetch = fetchMock
    render(<DeviceConsent userCode="BCDFGHJK" />)

    await userEvent.click(screen.getByRole('button', { name: 'Allow' }))
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }))

    const [allowing, denying] = keysSent(fetchMock)
    expect(denying).not.toBe(allowing)
  })
})
