import { SessionWatcher } from '@/components/app/SessionWatcher'

import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
const unsubscribe = vi.fn()
let capturedHandler: (() => void) | undefined

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/lib/sessionChannel', () => ({
  LOGIN_PATH: '/auth/login',
  onSessionCleared: (handler: () => void) => {
    capturedHandler = handler
    return unsubscribe
  },
}))

describe('SessionWatcher', () => {
  const originalLocation = window.location

  afterEach(() => {
    vi.clearAllMocks()
    capturedHandler = undefined
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('hard-navigates to the login page when another tab clears the session', () => {
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
    render(<SessionWatcher />)

    capturedHandler?.()

    expect(window.location.href).toBe('/auth/login')
  })

  it('refreshes the router when the tab becomes visible again', () => {
    render(<SessionWatcher />)

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not refresh when the tab becomes hidden', () => {
    render(<SessionWatcher />)

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(refresh).not.toHaveBeenCalled()
  })

  it('re-subscribes the visibility listener on every render, since router is not assumed stable', () => {
    // Real Next.js memoizes the router, but nothing here should assume that - this mock rebuilds
    // a new object on every call, the way a router genuinely could, so [router] as a dep actually
    // matters: dropping it to [] would leave a rerender's closure holding the stale router.
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    const { rerender } = render(<SessionWatcher />)
    const callsAfterMount = addEventListenerSpy.mock.calls.filter(([type]) => type === 'visibilitychange').length

    rerender(<SessionWatcher />)

    const callsAfterRerender = addEventListenerSpy.mock.calls.filter(([type]) => type === 'visibilitychange').length
    expect(callsAfterRerender).toBeGreaterThan(callsAfterMount)
    addEventListenerSpy.mockRestore()
  })

  it('unsubscribes and stops listening on unmount', () => {
    const { unmount } = render(<SessionWatcher />)

    unmount()

    expect(unsubscribe).toHaveBeenCalled()

    refresh.mockClear()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('renders nothing', () => {
    const { container } = render(<SessionWatcher />)

    expect(container.firstChild).toBeNull()
  })
})
