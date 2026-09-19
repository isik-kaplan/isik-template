import { redirect } from 'next/navigation'

import { createApi, createAuthApi } from '@/lib/apiClients'
import { broadcastSessionCleared } from '@/lib/sessionChannel'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/sessionChannel', () => ({ LOGIN_PATH: '/auth/login', broadcastSessionCleared: vi.fn() }))

function responseWith(headers: Record<string, string>) {
  return new Response(null, { headers })
}

describe('createApi auto-logout wrapping', () => {
  const originalLocation = window.location

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('passes an ordinary response through untouched, using the given baseFetch', async () => {
    const baseFetch = vi.fn(async () => responseWith({}))
    const api = createApi('http://api.test', { baseFetch })

    await api.me()

    expect(baseFetch).toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
    expect(broadcastSessionCleared).not.toHaveBeenCalled()
  })

  it('broadcasts and hard-navigates in the browser when the session was cleared', async () => {
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
    const baseFetch = vi.fn(async () => responseWith({ 'X-Session-Cleared': '1' }))
    const api = createApi('http://api.test', { baseFetch })

    await api.me()

    expect(broadcastSessionCleared).toHaveBeenCalledOnce()
    expect(window.location.href).toBe('/auth/login')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('redirects server-side when the session was cleared and there is no window', async () => {
    vi.stubGlobal('window', undefined)
    const baseFetch = vi.fn(async () => responseWith({ 'X-Session-Cleared': '1' }))
    const api = createApi('http://api.test', { baseFetch })

    await api.me()

    expect(redirect).toHaveBeenCalledWith('/auth/login')
    expect(broadcastSessionCleared).not.toHaveBeenCalled()
  })
})

describe('createAuthApi auto-logout wrapping', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('passes an ordinary response through untouched, using the given baseFetch', async () => {
    const baseFetch = vi.fn(async () => responseWith({}))
    const auth = createAuthApi('http://auth.test', { baseFetch, cookieHeader: 'csrftoken=abc' })

    await auth.session()

    expect(baseFetch).toHaveBeenCalled()
    expect(broadcastSessionCleared).not.toHaveBeenCalled()
  })

  it('broadcasts and hard-navigates when the session was cleared', async () => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
    const baseFetch = vi.fn(async () => responseWith({ 'X-Session-Cleared': '1' }))
    const auth = createAuthApi('http://auth.test', { baseFetch, cookieHeader: 'csrftoken=abc' })

    await auth.session()

    expect(broadcastSessionCleared).toHaveBeenCalledOnce()
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })
})
