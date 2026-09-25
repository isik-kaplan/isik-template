import { AppAuthApi } from '../app'
import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('AppAuthApi', () => {
  it('defaults to the global fetch when no baseFetch is supplied', async () => {
    const globalFetch = vi.fn<typeof fetch>(async () => jsonResponse({ status: 200, data: {}, meta: {} }))
    vi.stubGlobal('fetch', globalFetch)
    try {
      const api = new AppAuthApi('https://api.example.test', { getToken: () => null, setToken: vi.fn() })
      await api.session()
      expect(globalFetch).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test.prop([fc.stringMatching(/^[A-Za-z0-9]+$/)])(
    'sends whatever token getToken returns as X-Session-Token, verbatim',
    async (token) => {
      const baseFetch = vi.fn<typeof fetch>(async () => jsonResponse({ status: 200, data: {}, meta: {} }))
      const api = new AppAuthApi('https://api.example.test', { getToken: () => token, setToken: vi.fn(), baseFetch })
      await api.session()
      const [, init] = baseFetch.mock.calls[0]
      expect(new Headers(init?.headers).get('X-Session-Token')).toBe(token)
    }
  )

  it('sends no X-Session-Token header when there is no stored token yet', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => jsonResponse({ status: 200, data: {}, meta: {} }))
    const api = new AppAuthApi('https://api.example.test', { getToken: () => null, setToken: vi.fn(), baseFetch })
    await api.session()
    const [, init] = baseFetch.mock.calls[0]
    expect(new Headers(init?.headers).has('X-Session-Token')).toBe(false)
  })

  it('supports an async getToken', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => jsonResponse({ status: 200, data: {}, meta: {} }))
    const api = new AppAuthApi('https://api.example.test', {
      getToken: async () => 'async-token',
      setToken: vi.fn(),
      baseFetch,
    })
    await api.session()
    const [, init] = baseFetch.mock.calls[0]
    expect(new Headers(init?.headers).get('X-Session-Token')).toBe('async-token')
  })

  it('captures a fresh session_token from a response and hands it to setToken', async () => {
    const setToken = vi.fn()
    const baseFetch = vi.fn<typeof fetch>(async () =>
      jsonResponse({ status: 200, data: { user: {} }, meta: { is_authenticated: true, session_token: 'new-token' } })
    )
    const api = new AppAuthApi('https://api.example.test', { getToken: () => null, setToken, baseFetch })
    await api.login({ email: 'j@test.test', password: 'x' })
    expect(setToken).toHaveBeenCalledWith('new-token')
  })

  it('does not call setToken when a response carries no session_token', async () => {
    const setToken = vi.fn()
    const baseFetch = vi.fn<typeof fetch>(async () =>
      jsonResponse({ status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const api = new AppAuthApi('https://api.example.test', { getToken: () => null, setToken, baseFetch })
    await api.session()
    expect(setToken).not.toHaveBeenCalled()
  })

  it('tolerates a non-JSON response body without throwing', async () => {
    const setToken = vi.fn()
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('not json', { status: 500 }))
    const api = new AppAuthApi('https://api.example.test', { getToken: () => null, setToken, baseFetch })
    await expect(api.session()).resolves.toBeDefined()
    expect(setToken).not.toHaveBeenCalled()
  })

  it('clears the token on logout even when the response carries none of its own', async () => {
    const setToken = vi.fn()
    const baseFetch = vi.fn<typeof fetch>(async () => jsonResponse({ status: 200, data: {}, meta: {} }))
    const api = new AppAuthApi('https://api.example.test', { getToken: () => 'old-token', setToken, baseFetch })
    await api.logout()
    expect(setToken).toHaveBeenCalledWith(null)
  })

  it('signs up by POSTing to the app signup endpoint', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () =>
      jsonResponse({ status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const api = new AppAuthApi('https://api.example.test', { getToken: () => null, setToken: vi.fn(), baseFetch })
    await api.signup({ username: 'jane', email: 'j@test.test', password: 'x' })
    const [input] = baseFetch.mock.calls[0]
    const url = input instanceof Request ? input.url : String(input)
    expect(url).toContain('/v0/app/v1/auth/signup')
  })

  it.each([
    ['a 200 with is_authenticated true', { data: { user: {} }, meta: { is_authenticated: true } }, true],
    ['a 200 with is_authenticated false', { data: { user: {} }, meta: { is_authenticated: false } }, false],
  ])('isAuthenticated() reads meta.is_authenticated from %s', async (_label, body, expected) => {
    const baseFetch = vi.fn<typeof fetch>(async () => jsonResponse({ status: 200, ...body }))
    const api = new AppAuthApi('https://api.example.test', { getToken: () => null, setToken: vi.fn(), baseFetch })
    expect(await api.isAuthenticated()).toBe(expected)
  })

  it("isAuthenticated() falls back to a 401 error body's own meta", async () => {
    const baseFetch = vi.fn<typeof fetch>(async () =>
      jsonResponse({ status: 401, data: { flows: [] }, meta: { is_authenticated: false } }, 401)
    )
    const api = new AppAuthApi('https://api.example.test', { getToken: () => null, setToken: vi.fn(), baseFetch })
    expect(await api.isAuthenticated()).toBe(false)
  })

  it('isAuthenticated() defaults to false when neither data nor error carries meta', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response(null, { status: 500 }))
    const api = new AppAuthApi('https://api.example.test', { getToken: () => null, setToken: vi.fn(), baseFetch })
    expect(await api.isAuthenticated()).toBe(false)
  })
})
