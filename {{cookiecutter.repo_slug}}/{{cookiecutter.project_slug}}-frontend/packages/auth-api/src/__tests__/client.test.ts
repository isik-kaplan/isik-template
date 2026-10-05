import { AuthApi } from '../client'
import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

describe('AuthApi', () => {
  test.prop([fc.stringMatching(/^[A-Za-z0-9]+$/)])(
    'forwards a server-side cookie header verbatim, never priming a csrftoken cookie',
    async (token) => {
      const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
      const api = new AuthApi('https://auth.example.test', {
        baseFetch,
        cookieHeader: `csrftoken=${token}`,
      })
      await api.session()
      expect(baseFetch).toHaveBeenCalledTimes(1)
      const [, init] = baseFetch.mock.calls[0]
      const headers = new Headers(init?.headers)
      expect(headers.get('X-CSRFToken')).toBe(token)
      expect(headers.get('Cookie')).toBe(`csrftoken=${token}`)
    }
  )

  it('primes the csrftoken cookie with one GET when the browser has none yet', async () => {
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    let primed = false
    const baseFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (!primed && String(input).endsWith('/auth/session')) {
        primed = true
        document.cookie = 'csrftoken=primed-token'
      }
      return new Response('{}', { status: 200 })
    })
    const api = new AuthApi('https://auth.example.test', { baseFetch })
    await api.session()
    expect(baseFetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['config', () => [], 'GET', '/v0/browser/v1/config', undefined],
    ['completeMfaChallenge', () => ['123456'], 'POST', '/v0/browser/v1/auth/2fa/authenticate', { code: '123456' }],
    ['webauthnChallengeOptions', () => [], 'GET', '/v0/browser/v1/auth/webauthn/authenticate', undefined],
    [
      'completeWebauthnChallenge',
      () => [{ id: 'c' }],
      'POST',
      '/v0/browser/v1/auth/webauthn/authenticate',
      { credential: { id: 'c' } },
    ],
    ['reauthenticateWithCode', () => ['123456'], 'POST', '/v0/browser/v1/auth/2fa/reauthenticate', { code: '123456' }],
    ['webauthnReauthenticationOptions', () => [], 'GET', '/v0/browser/v1/auth/webauthn/reauthenticate', undefined],
    [
      'reauthenticateWithWebauthn',
      () => [{ id: 'c' }],
      'POST',
      '/v0/browser/v1/auth/webauthn/reauthenticate',
      { credential: { id: 'c' } },
    ],
    ['authenticators', () => [], 'GET', '/v0/browser/v1/account/authenticators', undefined],
    ['totpStatus', () => [], 'GET', '/v0/browser/v1/account/authenticators/totp', undefined],
    ['activateTotp', () => ['654321'], 'POST', '/v0/browser/v1/account/authenticators/totp', { code: '654321' }],
    ['deactivateTotp', () => [], 'DELETE', '/v0/browser/v1/account/authenticators/totp', undefined],
    ['recoveryCodes', () => [], 'GET', '/v0/browser/v1/account/authenticators/recovery-codes', undefined],
    ['regenerateRecoveryCodes', () => [], 'POST', '/v0/browser/v1/account/authenticators/recovery-codes', undefined],
    ['webauthnCreationOptions', () => [], 'GET', '/v0/browser/v1/account/authenticators/webauthn', undefined],
    [
      'addWebauthn',
      () => [{ id: 'c' }, 'Laptop'],
      'POST',
      '/v0/browser/v1/account/authenticators/webauthn',
      { credential: { id: 'c' }, name: 'Laptop' },
    ],
    [
      'removeWebauthn',
      () => [[7]],
      'DELETE',
      '/v0/browser/v1/account/authenticators/webauthn',
      { authenticators: [7] },
    ],
  ] as const)('%s calls %s %s', async (method, args, verb, path, body) => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    const api = new AuthApi('https://auth.example.test', { baseFetch, cookieHeader: 'csrftoken=t' })
    await (api[method] as (...rest: unknown[]) => Promise<unknown>)(...args())
    const [request] = baseFetch.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe(verb)
    expect(request.url).toBe(`https://auth.example.test${path}`)
    expect(body === undefined ? null : await request.json()).toEqual(body ?? null)
  })
})
