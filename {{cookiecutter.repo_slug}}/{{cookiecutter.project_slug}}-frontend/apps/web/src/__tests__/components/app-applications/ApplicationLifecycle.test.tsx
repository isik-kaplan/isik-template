import { ApplicationLifecycle } from '@/components/app-applications/ApplicationLifecycle'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

function application(approval: 'pending' | 'approved' | 'withdrawn' | 'disabled') {
  return { id: 7, approval } as Parameters<typeof ApplicationLifecycle>[0]['application']
}

function requested(fetchMock: ReturnType<typeof vi.fn>) {
  const [request] = fetchMock.mock.calls[0] as unknown as [Request]
  return { method: request.method, path: new URL(request.url).pathname, key: request.headers.get('Idempotency-Key') }
}

/** The Idempotency-Key each request so far carried, in order. */
function keysSent(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([request]) => (request as Request).headers.get('Idempotency-Key'))
}

/** Answers with each status in turn. */
function answering(...statuses: number[]) {
  return vi.fn(async () => new Response('{}', { status: statuses.shift() }))
}

/** A page served over plain http, as the e2e stack's is: the browser has no crypto.randomUUID there. */
function withoutRandomUUID() {
  const real = globalThis.crypto
  vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
}

describe('ApplicationLifecycle', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
  })

  it('switches an approved application off and reads the page again', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    globalThis.fetch = fetchMock
    render(<ApplicationLifecycle application={application('approved')} etag={'"4"'} />)

    expect(screen.getByText(/Nobody can sign in with it while it is off/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Switch it off' }))

    expect(requested(fetchMock)).toEqual({
      method: 'POST',
      path: '/v0/oauth-applications/7/disable/',
      key: expect.any(String),
    })
    expect(toast.success).toHaveBeenCalledWith('Switched off.')
    expect(refresh).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('switches it off on a page without crypto.randomUUID', async () => {
    withoutRandomUUID()
    const fetchMock = answering(200)
    globalThis.fetch = fetchMock
    render(<ApplicationLifecycle application={application('approved')} etag={'"4"'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Switch it off' }))

    expect(keysSent(fetchMock)).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/)])
    expect(toast.success).toHaveBeenCalledWith('Switched off.')
  })

  it.each([
    ['approved', 'Switch it off'],
    ['disabled', 'Switch it back on'],
  ] as const)('retries one %s under the same key, and makes a new one once it went through', async (approval, name) => {
    const fetchMock = answering(500, 200, 200)
    globalThis.fetch = fetchMock
    render(<ApplicationLifecycle application={application(approval)} etag={'"4"'} />)

    for (let attempt = 0; attempt < 3; attempt++) {
      await userEvent.click(screen.getByRole('button', { name }))
    }

    const [first, retry, again] = keysSent(fetchMock)
    expect(retry).toBe(first)
    expect(again).not.toBe(retry)
  })

  it('says so when it could not be switched off', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<ApplicationLifecycle application={application('approved')} etag={'"4"'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Switch it off' }))

    expect(toast.error).toHaveBeenCalledWith('Could not switch the app off.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('switches one that is off back on', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    globalThis.fetch = fetchMock
    render(<ApplicationLifecycle application={application('disabled')} etag={'"4"'} />)

    expect(screen.getByText(/It is off/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Switch it back on' }))

    expect(requested(fetchMock)).toEqual({
      method: 'POST',
      path: '/v0/oauth-applications/7/restore/',
      key: expect.any(String),
    })
    expect(toast.success).toHaveBeenCalledWith('Switched back on.')
    expect(refresh).toHaveBeenCalled()
  })

  it('says so when it could not be switched back on', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<ApplicationLifecycle application={application('disabled')} etag={'"4"'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Switch it back on' }))

    expect(toast.error).toHaveBeenCalledWith('Could not switch the app back on.')
  })

  it('deletes one that is off and leaves for the list', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock
    render(<ApplicationLifecycle application={application('disabled')} etag={'"4"'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))

    expect(requested(fetchMock)).toEqual({
      method: 'DELETE',
      path: '/v0/oauth-applications/7/',
      key: expect.any(String),
    })
    // Against the version this page showed: one changed since is shown again rather than deleted.
    expect((fetchMock.mock.calls[0] as unknown as [Request])[0].headers.get('If-Match')).toBe('"4"')
    expect(toast.success).toHaveBeenCalledWith('App deleted.')
    expect(push).toHaveBeenCalledWith('/applications')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('retries a failed delete under the same key', async () => {
    const fetchMock = answering(500, 200)
    globalThis.fetch = fetchMock
    render(<ApplicationLifecycle application={application('disabled')} etag={'"4"'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))

    const [first, retry] = keysSent(fetchMock)
    expect(first).toEqual(expect.any(String))
    expect(retry).toBe(first)
  })

  it('shows it as it is now, rather than deleting it, when it changed since the page loaded', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: 'Changed.', code: 'precondition_failed', current: { id: 7 } }), {
          status: 412,
          headers: { 'Content-Type': 'application/json' },
        })
    )
    render(<ApplicationLifecycle application={application('disabled')} etag={'"4"'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))

    expect(toast.error).toHaveBeenCalledWith('Someone else changed this since you opened it. Review their changes.')
    expect(push).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it('says so when it could not be deleted', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<ApplicationLifecycle application={application('disabled')} etag={'"4"'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete it' }))

    expect(toast.error).toHaveBeenCalledWith('Could not delete the app.')
    expect(push).not.toHaveBeenCalled()
  })

  it('holds every button while one request is out', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}))
    render(<ApplicationLifecycle application={application('disabled')} etag={'"4"'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Switch it back on' }))

    expect(screen.getAllByRole('button').every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
  })

  it('holds the off switch while it is out', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}))
    render(<ApplicationLifecycle application={application('approved')} etag={'"4"'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Switch it off' }))

    expect((screen.getByRole('button', { name: 'Switch it off' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it.each([
    ['pending', 'A superuser has to approve it before it can sign anybody in.'],
    ['withdrawn', 'A superuser withdrew it. Only a superuser can approve it again.'],
  ] as const)('offers nothing but says why while it is %s', (approval, said) => {
    render(<ApplicationLifecycle application={application(approval)} etag={'"4"'} />)

    expect(screen.getByText(said)).toBeTruthy()
    expect(screen.queryAllByRole('button')).toEqual([])
  })
})
