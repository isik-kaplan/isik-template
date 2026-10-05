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

  it('names a network failure by the call that failed', async () => {
    const baseFetch = vi.fn(async () => Promise.reject(new TypeError('fetch failed')))
    const api = createApi('http://api.test', { baseFetch })

    await expect(api.me()).rejects.toThrow(/^fetch failed: GET http:\/\/api\.test\/v0\/users\/me\/$/)
  })

  it("leaves Next's redirect throw alone rather than renaming it a fetch failure", async () => {
    vi.stubGlobal('window', undefined)
    const thrown = new Error('NEXT_REDIRECT')
    vi.mocked(redirect).mockImplementationOnce(() => {
      throw thrown
    })
    const api = createApi('http://api.test', {
      baseFetch: vi.fn(async () => responseWith({ 'X-Session-Cleared': '1' })),
    })

    await expect(api.me()).rejects.toBe(thrown)
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

describe('the re-authentication gate', () => {
  const originalLocation = window.location

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it.each([
    ['createApi', () => createApi('http://api.test', { baseFetch: refusedFetch() }).me()],
    [
      'createAuthApi',
      () => createAuthApi('http://auth.test', { baseFetch: refusedFetch(), cookieHeader: 'a=b' }).emails(),
    ],
  ])('%s sends the browser to prove it is them and back to this page, and never settles', async (_, call) => {
    Object.defineProperty(window, 'location', {
      value: { href: '', pathname: '/profile/emails', search: '?tab=1' },
      writable: true,
    })

    const settled = await Promise.race([
      call().then(() => true),
      new Promise((resolve) => setTimeout(resolve, 20, false)),
    ])

    expect(settled).toBe(false)
    expect(window.location.href).toBe('/auth/prove?next=%2Fprofile%2Femails%3Ftab%3D1')
    expect(broadcastSessionCleared).not.toHaveBeenCalled()
  })

  it('passes the refusal through untouched where there is no browser to send anywhere', async () => {
    vi.stubGlobal('window', undefined)
    const api = createApi('http://api.test', { baseFetch: refusedFetch() })

    const { response } = await api.me()

    expect(response.headers.get('X-Reauthentication-Required')).toBe('1')
    expect(redirect).not.toHaveBeenCalled()
  })
})

function refusedFetch() {
  return vi.fn(async () => responseWith({ 'X-Reauthentication-Required': '1' }))
}
