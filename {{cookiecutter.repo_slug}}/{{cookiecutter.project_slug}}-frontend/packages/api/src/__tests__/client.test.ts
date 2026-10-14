import { Api } from '../client'
import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

describe('Api', () => {
  it('sends credentials and reads the CSRF token from the browser cookie', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    document.cookie = 'csrftoken=browser-token'
    const api = new Api('https://api.example.test', { baseFetch })
    await api.me()
    const [, init] = baseFetch.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(headers.get('X-CSRFToken')).toBe('browser-token')
    expect(init?.credentials).toBe('include')
  })

  test.prop([fc.stringMatching(/^[A-Za-z0-9]+$/)])(
    'forwards a server-side cookie header verbatim instead of reading document.cookie',
    async (token) => {
      const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
      const api = new Api('https://api.example.test', {
        baseFetch,
        cookieHeader: `csrftoken=${token}`,
      })
      await api.me()
      const [, init] = baseFetch.mock.calls[0]
      const headers = new Headers(init?.headers)
      expect(headers.get('X-CSRFToken')).toBe(token)
      expect(headers.get('Cookie')).toBe(`csrftoken=${token}`)
    }
  )

  it.each([
    ['oauthApplications', (api: Api) => api.oauthApplications(), 'GET', '/v0/oauth-applications/'],
    [
      'registerOAuthApplication',
      (api: Api) =>
        api.registerOAuthApplication(
          { name: 'Acme', client_type: 'public', redirect_uris: ['https://a.test/cb'] },
          'the-key'
        ),
      'POST',
      '/v0/oauth-applications/',
    ],
    ['deleteOAuthApplication', (api: Api) => api.deleteOAuthApplication(7), 'DELETE', '/v0/oauth-applications/7/'],
    ['oauthApplication', (api: Api) => api.oauthApplication(7), 'GET', '/v0/oauth-applications/7/'],
    [
      'updateOAuthApplication',
      (api: Api) => api.updateOAuthApplication(7, { name: 'Acme' }),
      'PATCH',
      '/v0/oauth-applications/7/',
    ],
    [
      'disableOAuthApplication',
      (api: Api) => api.disableOAuthApplication(7, 'the-key'),
      'POST',
      '/v0/oauth-applications/7/disable/',
    ],
    [
      'restoreOAuthApplication',
      (api: Api) => api.restoreOAuthApplication(7, 'the-key'),
      'POST',
      '/v0/oauth-applications/7/restore/',
    ],
    [
      'rotateOAuthApplicationSecret',
      (api: Api) => api.rotateOAuthApplicationSecret(7, true, 'the-key'),
      'POST',
      '/v0/oauth-applications/7/rotate-secret/',
    ],
    ['delegatableScopes', (api: Api) => api.delegatableScopes(), 'GET', '/v0/oauth-applications/delegatable-scopes/'],
    ['oauthApplicationReviews', (api: Api) => api.oauthApplicationReviews(), 'GET', '/v0/oauth-application-reviews/'],
    ['oauthApplicationReview', (api: Api) => api.oauthApplicationReview(7), 'GET', '/v0/oauth-application-reviews/7/'],
    [
      'approveOAuthApplication',
      (api: Api) => api.approveOAuthApplication(7, ['users:manage:user'], 'the-key'),
      'POST',
      '/v0/oauth-application-reviews/7/approve/',
    ],
    [
      'withdrawOAuthApplication',
      (api: Api) => api.withdrawOAuthApplication(7, 'the-key'),
      'POST',
      '/v0/oauth-application-reviews/7/withdraw/',
    ],
    ['users', (api: Api) => api.users(), 'GET', '/v0/users/'],
    ['permissions', (api: Api) => api.permissions(), 'GET', '/v0/users/permissions/'],
    ['user', (api: Api) => api.user('u1'), 'GET', '/v0/users/u1/'],
    ['updateUser', (api: Api) => api.updateUser('u1', { is_active: false }), 'PATCH', '/v0/users/u1/'],
    ['authorizedApplications', (api: Api) => api.authorizedApplications(), 'GET', '/v0/authorized-applications/'],
    [
      'revokeAuthorizedApplication',
      (api: Api) => api.revokeAuthorizedApplication(7),
      'DELETE',
      '/v0/authorized-applications/7/',
    ],
    [
      'deviceAuthorization',
      (api: Api) => api.deviceAuthorization('BCDF-GHJK'),
      'GET',
      '/v0/device-authorizations/BCDF-GHJK/',
    ],
    [
      'approveDevice',
      (api: Api) => api.approveDevice('BCDFGHJK', 'the-key'),
      'POST',
      '/v0/device-authorizations/BCDFGHJK/approve/',
    ],
    [
      'denyDevice',
      (api: Api) => api.denyDevice('BCDFGHJK', 'the-key'),
      'POST',
      '/v0/device-authorizations/BCDFGHJK/deny/',
    ],
    ['personalAccessTokens', (api: Api) => api.personalAccessTokens(), 'GET', '/v0/personal-access-tokens/'],
    [
      'deletePersonalAccessToken',
      (api: Api) => api.deletePersonalAccessToken('t1'),
      'DELETE',
      '/v0/personal-access-tokens/t1/',
    ],
    [
      'personalAccessTokenScopes',
      (api: Api) => api.personalAccessTokenScopes(),
      'GET',
      '/v0/personal-access-tokens/scopes/',
    ],
  ])('%s calls %s %s', async (_name, call, method, path) => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    await call(new Api('https://api.example.test', { baseFetch }))
    const [request] = baseFetch.mock.calls[0]
    expect(request instanceof Request ? request.method : undefined).toBe(method)
    expect(String(request instanceof Request ? request.url : request)).toBe(`https://api.example.test${path}`)
  })

  it('sends the application to register as its body, under the idempotency key it was given', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 201 }))
    const data = { name: 'Acme', client_type: 'confidential' as const, redirect_uris: ['https://a.test/cb'] }
    await new Api('https://api.example.test', { baseFetch }).registerOAuthApplication(data, 'the-key')
    const [request, init] = baseFetch.mock.calls[0]
    expect(await (request as Request).json()).toEqual(data)
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('the-key')
  })

  it('sends the token to make as its body, under the idempotency key it was given', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 201 }))
    const data = { name: 'CI', scopes: ['users:manage:user'], expires_at: null }
    await new Api('https://api.example.test', { baseFetch }).makePersonalAccessToken(data, 'the-key')
    const [request, init] = baseFetch.mock.calls[0]
    expect((request as Request).method).toBe('POST')
    expect(String((request as Request).url)).toBe('https://api.example.test/v0/personal-access-tokens/')
    expect(await (request as Request).json()).toEqual(data)
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('the-key')
  })

  it.each([
    ['approveDevice', (api: Api) => api.approveDevice('BCDFGHJK', 'the-key')],
    ['denyDevice', (api: Api) => api.denyDevice('BCDFGHJK', 'the-key')],
  ])('%s answers under the idempotency key it was given', async (_name, call) => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    await call(new Api('https://api.example.test', { baseFetch }))
    const [, init] = baseFetch.mock.calls[0]
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('the-key')
  })

  it("asks for one user's history through the path and passes its query through", async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    const api = new Api('https://api.example.test', { baseFetch })
    await api.userHistory('user-1', { action: 'update', page: 2 })
    const [request] = baseFetch.mock.calls[0]
    expect(String(request instanceof Request ? request.url : request)).toBe(
      'https://api.example.test/v0/users/user-1/history/?action=update&page=2'
    )
  })
})
