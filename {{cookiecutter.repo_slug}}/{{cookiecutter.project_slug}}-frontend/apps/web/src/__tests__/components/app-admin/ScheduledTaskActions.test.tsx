import { ScheduledTaskActions } from '@/components/app-admin/ScheduledTaskActions'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

type Task = Parameters<typeof ScheduledTaskActions>[0]['task']

function task(may: string[], paused = false) {
  return { name: 'clear_expired_tokens', may, effective: { paused } } as unknown as Task
}

/** Answers with each status in turn. */
function answering(...statuses: number[]) {
  return vi.fn(async () => new Response('{}', { status: statuses.shift() }))
}

function sent(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([request]) => {
    const asked = request as Request
    return [asked.method, new URL(asked.url).pathname, asked.headers.get('Idempotency-Key')]
  })
}

describe('ScheduledTaskActions', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('offers only what the declaration allows', () => {
    render(<ScheduledTaskActions task={task(['view'])} />)

    expect(screen.queryAllByRole('button')).toEqual([])
  })

  it.each([
    [false, 'Pause', '/v0/scheduled-tasks/clear_expired_tokens/pause/'],
    [true, 'Resume', '/v0/scheduled-tasks/clear_expired_tokens/resume/'],
  ])('paused %s: %s it, and reads the page again', async (paused, label, path) => {
    const fetchMock = answering(200)
    globalThis.fetch = fetchMock
    render(<ScheduledTaskActions task={task(['view', 'pause'], paused)} />)

    await userEvent.click(screen.getByRole('button', { name: label }))

    const [[method, pathname, key]] = sent(fetchMock)
    expect([method, pathname]).toEqual(['POST', path])
    expect(key).toBeTruthy()
    expect(toast.success).toHaveBeenCalledWith('Done.')
    expect(refresh).toHaveBeenCalled()
  })

  it('runs it now', async () => {
    const fetchMock = answering(200)
    globalThis.fetch = fetchMock
    render(<ScheduledTaskActions task={task(['view', 'run_now'])} />)

    await userEvent.click(screen.getByRole('button', { name: 'Run now' }))

    expect(sent(fetchMock)[0].slice(0, 2)).toEqual(['POST', '/v0/scheduled-tasks/clear_expired_tokens/run/'])
  })

  it('resumes under a key of its own, not the one a pause that failed was sent under', async () => {
    const fetchMock = answering(500, 200)
    globalThis.fetch = fetchMock
    const { rerender } = render(<ScheduledTaskActions task={task(['view', 'pause'])} />)

    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    // Paused meanwhile by somebody else, and read again.
    rerender(<ScheduledTaskActions task={task(['view', 'pause'], true)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }))

    const [[, paused, pauseKey], [, resumed, resumeKey]] = sent(fetchMock)
    expect([paused, resumed]).toEqual([
      '/v0/scheduled-tasks/clear_expired_tokens/pause/',
      '/v0/scheduled-tasks/clear_expired_tokens/resume/',
    ])
    expect(resumeKey).not.toBe(pauseKey)
  })

  it('retries under the same key, and makes a new one once it went through', async () => {
    const fetchMock = answering(500, 200, 200)
    globalThis.fetch = fetchMock
    render(<ScheduledTaskActions task={task(['view', 'run_now'])} />)

    for (let attempt = 0; attempt < 3; attempt++) {
      await userEvent.click(screen.getByRole('button', { name: 'Run now' }))
    }

    const [first, retry, again] = sent(fetchMock).map(([, , key]) => key)
    expect(retry).toBe(first)
    expect(again).not.toBe(first)
    expect(toast.error).toHaveBeenCalledWith("That didn't work - try again.")
  })
})
