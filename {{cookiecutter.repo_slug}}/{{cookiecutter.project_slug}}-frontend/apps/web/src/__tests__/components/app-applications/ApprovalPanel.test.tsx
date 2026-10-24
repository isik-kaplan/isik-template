import { ApprovalPanel } from '@/components/app-applications/ApprovalPanel'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const SCOPES = [
  { name: 'users:grant:rights', label: 'Grant' },
  { name: 'users:manage:user', label: 'Manage people' },
  { name: 'other:read:x', label: 'Not asked for' },
]

function application(approval: 'pending' | 'approved' | 'withdrawn' | 'disabled', approved: string[] = []) {
  return {
    id: 7,
    approval,
    requested_scopes: ['users:grant:rights', 'users:manage:user'],
    approved_scopes: approved,
  } as unknown as Parameters<typeof ApprovalPanel>[0]['application']
}

const box = (name: RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement

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

describe('ApprovalPanel', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
  })

  it('offers only what was asked for, all of it ticked while it waits', () => {
    render(<ApprovalPanel application={application('pending')} etag={'"5"'} scopes={SCOPES} />)

    expect(screen.getByRole('group', { name: 'Let it ask for' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Not asked for/ })).toBeNull()
    expect(box(/Grant/).checked).toBe(true)
    expect(box(/Manage people/).checked).toBe(true)
  })

  it('offers what was last approved once it has been answered', () => {
    render(<ApprovalPanel application={application('approved', ['users:manage:user'])} etag={'"5"'} scopes={SCOPES} />)

    expect(box(/Grant/).checked).toBe(false)
    expect(box(/Manage people/).checked).toBe(true)
  })

  it('approves for what is ticked and reads the page again', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    globalThis.fetch = fetchMock
    render(<ApprovalPanel application={application('pending')} etag={'"5"'} scopes={SCOPES} />)

    await userEvent.click(box(/Grant/))
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/v0/oauth-application-reviews/7/approve/')
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()
    // Against what it asked for when this page loaded, which may have changed since.
    expect(request.headers.get('If-Match')).toBe('"5"')
    expect(await request.json()).toEqual({ approved_scopes: ['users:manage:user'] })
    expect(toast.success).toHaveBeenCalledWith('Approved.')
    expect(refresh).toHaveBeenCalled()
  })

  it('approves on a page without crypto.randomUUID', async () => {
    withoutRandomUUID()
    const fetchMock = answering(200)
    globalThis.fetch = fetchMock
    render(<ApprovalPanel application={application('pending')} etag={'"5"'} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(keysSent(fetchMock)).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/)])
    expect(toast.success).toHaveBeenCalledWith('Approved.')
  })

  it('retries an approval under the same key, and makes a new one for other scopes or once it went through', async () => {
    const fetchMock = answering(500, 500, 200, 200)
    globalThis.fetch = fetchMock
    render(<ApprovalPanel application={application('pending')} etag={'"5"'} scopes={SCOPES} />)

    const approve = () => userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await approve()
    await approve()
    await userEvent.click(box(/Grant/))
    await approve()
    await approve()

    const [first, retry, narrowed, again] = keysSent(fetchMock)
    expect(retry).toBe(first)
    expect(narrowed).not.toBe(first)
    expect(again).not.toBe(narrowed)
  })

  it('shows what it asks for now, rather than approving, when that changed since the page loaded', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: 'Changed.', code: 'precondition_failed', current: { id: 7 } }), {
          status: 412,
          headers: { 'Content-Type': 'application/json' },
        })
    )
    render(<ApprovalPanel application={application('pending')} etag={'"5"'} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(toast.error).toHaveBeenCalledWith('Someone else changed this since you opened it. Review their changes.')
    expect(toast.success).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it('says so when it could not approve', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<ApprovalPanel application={application('pending')} etag={'"5"'} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(toast.error).toHaveBeenCalledWith('Could not approve the app.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('withdraws it and reads the page again', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    globalThis.fetch = fetchMock
    render(<ApprovalPanel application={application('approved')} etag={'"5"'} scopes={SCOPES} />)

    expect(screen.getByText(/Withdrawing it signs everybody out of it/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/v0/oauth-application-reviews/7/withdraw/')
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()
    expect(toast.success).toHaveBeenCalledWith('Withdrawn.')
    expect(refresh).toHaveBeenCalled()
  })

  it('retries a withdrawal under the same key, and makes a new one once it went through', async () => {
    const fetchMock = answering(500, 200, 200)
    globalThis.fetch = fetchMock
    render(<ApprovalPanel application={application('approved')} etag={'"5"'} scopes={SCOPES} />)

    for (let attempt = 0; attempt < 3; attempt++) {
      await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    }

    const [first, retry, again] = keysSent(fetchMock)
    expect(retry).toBe(first)
    expect(again).not.toBe(retry)
  })

  it('says so when it could not withdraw', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<ApprovalPanel application={application('approved')} etag={'"5"'} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }))

    expect(toast.error).toHaveBeenCalledWith('Could not withdraw the app.')
  })

  it('offers only approving one already withdrawn', () => {
    render(<ApprovalPanel application={application('withdrawn')} etag={'"5"'} scopes={SCOPES} />)

    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull()
  })

  it('offers only withdrawing one its owner switched off', () => {
    render(<ApprovalPanel application={application('disabled')} etag={'"5"'} scopes={SCOPES} />)

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeTruthy()
  })

  it('holds both buttons while one is out', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}))
    render(<ApprovalPanel application={application('approved')} etag={'"5"'} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Withdraw' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
