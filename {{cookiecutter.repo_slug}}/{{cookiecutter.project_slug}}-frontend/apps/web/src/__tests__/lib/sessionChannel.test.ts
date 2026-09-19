import { LOGIN_PATH, broadcastSessionCleared, onSessionCleared } from '@/lib/sessionChannel'

import { afterEach, describe, expect, it, vi } from 'vitest'

const CHANNEL_NAME = '{{ cookiecutter.project_slug }}-session'

// A plain setTimeout(0) is enough in isolation, but not under the heavy CPU contention a mutation
// testing run puts every test under - BroadcastChannel delivery is a real macrotask, and a busy
// event loop can push it well past the next tick. A longer, once-only wait for the *absence* of a
// call still proves the negative; a polling wait for the *presence* of one doesn't need the delay
// at all once it arrives.
function waitForQuiet() {
  return new Promise((resolve) => setTimeout(resolve, 100))
}

describe('sessionChannel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exports the login path every consumer redirects to', () => {
    expect(LOGIN_PATH).toBe('/auth/login')
  })

  it('reaches a listener in another tab', async () => {
    const received = vi.fn()
    const otherTab = new BroadcastChannel(CHANNEL_NAME)
    otherTab.onmessage = (event) => received(event.data)

    broadcastSessionCleared()

    await vi.waitFor(() => expect(received).toHaveBeenCalledWith('session-cleared'))
    otherTab.close()
  })

  it('notifies a subscriber when another tab broadcasts a cleared session', async () => {
    const handler = vi.fn()
    const unsubscribe = onSessionCleared(handler)
    const otherTab = new BroadcastChannel(CHANNEL_NAME)

    otherTab.postMessage('session-cleared')

    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce())
    unsubscribe()
    otherTab.close()
  })

  it('ignores a message that is not the session-cleared signal', async () => {
    const handler = vi.fn()
    const unsubscribe = onSessionCleared(handler)
    const otherTab = new BroadcastChannel(CHANNEL_NAME)

    otherTab.postMessage('something-else')
    await waitForQuiet()

    expect(handler).not.toHaveBeenCalled()
    unsubscribe()
    otherTab.close()
  })

  it('stops notifying once unsubscribed', async () => {
    const handler = vi.fn()
    const unsubscribe = onSessionCleared(handler)
    unsubscribe()
    const otherTab = new BroadcastChannel(CHANNEL_NAME)

    otherTab.postMessage('session-cleared')
    await waitForQuiet()

    expect(handler).not.toHaveBeenCalled()
    otherTab.close()
  })

  it('never reaches another tab when called outside the browser', async () => {
    const received = vi.fn()
    const otherTab = new BroadcastChannel(CHANNEL_NAME)
    otherTab.onmessage = (event) => received(event.data)
    vi.stubGlobal('window', undefined)

    expect(() => broadcastSessionCleared()).not.toThrow()
    await waitForQuiet()

    expect(received).not.toHaveBeenCalled()
    otherTab.close()
  })

  it('unsubscribing outside the browser does not throw', () => {
    vi.stubGlobal('window', undefined)

    expect(() => onSessionCleared(vi.fn())()).not.toThrow()
  })
})
