import { NOTIFICATIONS_READ, NotificationBell } from '@/components/app-auth/NotificationBell'

import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let pathname = '/applications'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function unread(...counts: number[]) {
  const fetchMock = vi.fn(async () => jsonResponse(200, { count: counts.shift() ?? 0, results: [] }))
  globalThis.fetch = fetchMock as never
  return fetchMock
}

const bell = () => screen.getByRole('link')

describe('NotificationBell', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    pathname = '/applications'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('leads to the inbox, named plainly while nothing is unread', async () => {
    const fetchMock = unread(0)
    render(<NotificationBell />)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(bell().getAttribute('href')).toBe('/profile/notifications')
    expect(bell().getAttribute('aria-label')).toBe('Notifications')
    expect(bell().textContent).toBe('')
    expect(bell().className).toContain('relative')
    expect(bell().className).toContain('size-9')
    expect(bell().className).toContain('hover:bg-muted')
  })

  it('asks for one unread row, since the count comes with it', async () => {
    const fetchMock = unread(0)
    render(<NotificationBell />)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    const url = new URL(request.url)
    expect(url.pathname).toBe('/v0/notifications/inbox/')
    expect(url.searchParams.get('unread')).toBe('true')
    expect(url.searchParams.get('page_size')).toBe('1')
  })

  it('shows how many are unread, and says it', async () => {
    unread(3)
    render(<NotificationBell />)

    expect(await screen.findByText('3')).toBeTruthy()
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 3 unread')
  })

  it('says one unread in the singular', async () => {
    unread(1)
    render(<NotificationBell />)

    expect(await screen.findByText('1')).toBeTruthy()
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 1 unread')
  })

  it('caps the number shown past 99, while still saying the whole of it', async () => {
    unread(99)
    const { unmount } = render(<NotificationBell />)
    expect(await screen.findByText('99')).toBeTruthy()
    unmount()

    unread(100)
    render(<NotificationBell />)
    expect(await screen.findByText('99+')).toBeTruthy()
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 100 unread')
  })

  it('counts as none when the inbox could not be read', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { count: 2, results: [] }))
      .mockResolvedValueOnce(jsonResponse(500, {}))
    globalThis.fetch = fetchMock as never
    render(<NotificationBell />)
    expect(await screen.findByText('2')).toBeTruthy()

    await act(async () => window.dispatchEvent(new Event(NOTIFICATIONS_READ)))

    await vi.waitFor(() => expect(bell().getAttribute('aria-label')).toBe('Notifications'))
    expect(bell().textContent).toBe('')
  })

  it('counts again on arriving at another page', async () => {
    const fetchMock = unread(2, 0)
    const { rerender } = render(<NotificationBell />)
    expect(await screen.findByText('2')).toBeTruthy()

    pathname = '/profile/notifications'
    rerender(<NotificationBell />)

    await vi.waitFor(() => expect(bell().textContent).toBe(''))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('counts again once something is marked read, and stops listening when gone', async () => {
    const fetchMock = unread(2, 1)
    const { unmount } = render(<NotificationBell />)
    expect(await screen.findByText('2')).toBeTruthy()

    await act(async () => window.dispatchEvent(new Event(NOTIFICATIONS_READ)))

    expect(await screen.findByText('1')).toBeTruthy()
    unmount()
    window.dispatchEvent(new Event(NOTIFICATIONS_READ))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('drops an answer that arrives after a newer one', async () => {
    const answers: ((response: Response) => void)[] = []
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => answers.push(resolve))) as never
    const { rerender } = render(<NotificationBell />)
    await vi.waitFor(() => expect(answers).toHaveLength(1))
    pathname = '/profile/notifications'
    rerender(<NotificationBell />)
    await vi.waitFor(() => expect(answers).toHaveLength(2))

    await act(async () => answers[1](jsonResponse(200, { count: 1, results: [] })))
    await act(async () => answers[0](jsonResponse(200, { count: 5, results: [] })))

    expect(bell().textContent).toBe('1')
  })
})
