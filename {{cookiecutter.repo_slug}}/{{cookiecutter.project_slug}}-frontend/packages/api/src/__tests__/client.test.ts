import { Api } from '../client'
import { test } from '@fast-check/vitest'
import { idempotencyKey, ifMatch } from '@isikk/core'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

const READ = ifMatch('"3"')
const KEY = idempotencyKey('the-key')['Idempotency-Key']
const WRITE = { ...READ, ...idempotencyKey('the-key') }

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
          KEY
        ),
      'POST',
      '/v0/oauth-applications/',
    ],
    [
      'deleteOAuthApplication',
      (api: Api) => api.deleteOAuthApplication(7, WRITE),
      'DELETE',
      '/v0/oauth-applications/7/',
    ],
    ['oauthApplication', (api: Api) => api.oauthApplication(7), 'GET', '/v0/oauth-applications/7/'],
    [
      'updateOAuthApplication',
      (api: Api) => api.updateOAuthApplication(7, { name: 'Acme' }, WRITE),
      'PATCH',
      '/v0/oauth-applications/7/',
    ],
    [
      'disableOAuthApplication',
      (api: Api) => api.disableOAuthApplication(7, KEY),
      'POST',
      '/v0/oauth-applications/7/disable/',
    ],
    [
      'restoreOAuthApplication',
      (api: Api) => api.restoreOAuthApplication(7, KEY),
      'POST',
      '/v0/oauth-applications/7/restore/',
    ],
    [
      'rotateOAuthApplicationSecret',
      (api: Api) => api.rotateOAuthApplicationSecret(7, true, KEY),
      'POST',
      '/v0/oauth-applications/7/rotate-secret/',
    ],
    ['delegatableScopes', (api: Api) => api.delegatableScopes(), 'GET', '/v0/oauth-applications/delegatable-scopes/'],
    ['oauthApplicationReviews', (api: Api) => api.oauthApplicationReviews(), 'GET', '/v0/oauth-application-reviews/'],
    ['oauthApplicationReview', (api: Api) => api.oauthApplicationReview(7), 'GET', '/v0/oauth-application-reviews/7/'],
    [
      'approveOAuthApplication',
      (api: Api) => api.approveOAuthApplication(7, ['users:manage:user'], KEY, READ),
      'POST',
      '/v0/oauth-application-reviews/7/approve/',
    ],
    [
      'withdrawOAuthApplication',
      (api: Api) => api.withdrawOAuthApplication(7, KEY),
      'POST',
      '/v0/oauth-application-reviews/7/withdraw/',
    ],
    ['users', (api: Api) => api.users(), 'GET', '/v0/users/'],
    ['permissions', (api: Api) => api.permissions(), 'GET', '/v0/users/permissions/'],
    ['user', (api: Api) => api.user('u1'), 'GET', '/v0/users/u1/'],
    ['updateUser', (api: Api) => api.updateUser('u1', { is_active: false }, WRITE), 'PATCH', '/v0/users/u1/'],
    ['authorizedApplications', (api: Api) => api.authorizedApplications(), 'GET', '/v0/authorized-applications/'],
    [
      'revokeAuthorizedApplication',
      (api: Api) => api.revokeAuthorizedApplication(7, KEY),
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
      (api: Api) => api.approveDevice('BCDFGHJK', KEY),
      'POST',
      '/v0/device-authorizations/BCDFGHJK/approve/',
    ],
    ['denyDevice', (api: Api) => api.denyDevice('BCDFGHJK', KEY), 'POST', '/v0/device-authorizations/BCDFGHJK/deny/'],
    ['personalAccessTokens', (api: Api) => api.personalAccessTokens(), 'GET', '/v0/personal-access-tokens/'],
    [
      'deletePersonalAccessToken',
      (api: Api) => api.deletePersonalAccessToken('t1', KEY),
      'DELETE',
      '/v0/personal-access-tokens/t1/',
    ],
    [
      'personalAccessTokenScopes',
      (api: Api) => api.personalAccessTokenScopes(),
      'GET',
      '/v0/personal-access-tokens/scopes/',
    ],
    ['notifications', (api: Api) => api.notifications(), 'GET', '/v0/notifications/inbox/'],
    [
      'notifications, unread only',
      (api: Api) => api.notifications({ unread: true }),
      'GET',
      '/v0/notifications/inbox/?unread=true',
    ],
    ['markNotificationRead', (api: Api) => api.markNotificationRead('n1'), 'POST', '/v0/notifications/inbox/n1/read/'],
    [
      'markAllNotificationsRead',
      (api: Api) => api.markAllNotificationsRead(),
      'POST',
      '/v0/notifications/inbox/read-all/',
    ],
    ['notificationKinds', (api: Api) => api.notificationKinds(), 'GET', '/v0/notifications/kinds/'],
    ['devices', (api: Api) => api.devices(), 'GET', '/v0/notifications/devices/'],
    [
      'registerDevice',
      (api: Api) => api.registerDevice({ platform: 'apns', token: 'a1b2' }),
      'POST',
      '/v0/notifications/devices/',
    ],
    ['forgetDevice', (api: Api) => api.forgetDevice('d1'), 'DELETE', '/v0/notifications/devices/d1/'],
    ['features', (api: Api) => api.features(), 'GET', '/v0/features/'],
    ['settings', (api: Api) => api.settings(), 'GET', '/v0/settings/'],
  ])('%s calls %s %s', async (_name, call, method, path) => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    await call(new Api('https://api.example.test', { baseFetch }))
    const [request] = baseFetch.mock.calls[0]
    expect(request instanceof Request ? request.method : undefined).toBe(method)
    expect(String(request instanceof Request ? request.url : request)).toBe(`https://api.example.test${path}`)
  })

  it("sends the phone's token as its body", async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 201 }))
    const device = { platform: 'fcm', token: 'a1b2', environment: 'production', app_id: '' } as const
    await new Api('https://api.example.test', { baseFetch }).registerDevice(device)
    const [request] = baseFetch.mock.calls[0]
    expect(await (request as Request).json()).toEqual(device)
  })

  it('sends the choice about a kind as its body', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    await new Api('https://api.example.test', { baseFetch }).chooseNotifications('account_changed', false)
    const [request] = baseFetch.mock.calls[0]
    expect((request as Request).method).toBe('POST')
    expect(String((request as Request).url)).toBe('https://api.example.test/v0/notifications/subscriptions/')
    expect(await (request as Request).json()).toEqual({ kind: 'account_changed', enabled: false })
  })

  it('sends a setting as its name in the path and its typed value as the body', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    await new Api('https://api.example.test', { baseFetch }).changeSetting(
      'token_lifetime_days',
      { type: 'int', value: 60 },
      READ
    )
    const [request] = baseFetch.mock.calls[0]
    expect((request as Request).method).toBe('PATCH')
    expect(String((request as Request).url)).toBe('https://api.example.test/v0/settings/token_lifetime_days/')
    expect(await (request as Request).json()).toEqual({ type: 'int', value: 60 })
  })

  it('sends the application to register as its body, under the idempotency key it was given', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 201 }))
    const data = { name: 'Acme', client_type: 'confidential' as const, redirect_uris: ['https://a.test/cb'] }
    await new Api('https://api.example.test', { baseFetch }).registerOAuthApplication(data, KEY)
    const [request, init] = baseFetch.mock.calls[0]
    expect(await (request as Request).json()).toEqual(data)
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('the-key')
  })

  it('sends the token to make as its body, under the idempotency key it was given', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 201 }))
    const data = { name: 'CI', scopes: ['users:manage:user'], expires_at: '2026-12-01T00:00:00Z' }
    await new Api('https://api.example.test', { baseFetch }).makePersonalAccessToken(data, KEY)
    const [request, init] = baseFetch.mock.calls[0]
    expect((request as Request).method).toBe('POST')
    expect(String((request as Request).url)).toBe('https://api.example.test/v0/personal-access-tokens/')
    expect(await (request as Request).json()).toEqual(data)
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('the-key')
  })

  it.each([
    ['approveDevice', (api: Api) => api.approveDevice('BCDFGHJK', KEY)],
    ['denyDevice', (api: Api) => api.denyDevice('BCDFGHJK', KEY)],
    ['revokeAuthorizedApplication', (api: Api) => api.revokeAuthorizedApplication(7, KEY)],
    ['deletePersonalAccessToken', (api: Api) => api.deletePersonalAccessToken('t1', KEY)],
    ['updateMe', (api: Api) => api.updateMe({ language: 'en' }, WRITE)],
    ['updateUser', (api: Api) => api.updateUser('u1', { is_active: false }, WRITE)],
    ['updateOAuthApplication', (api: Api) => api.updateOAuthApplication(7, { name: 'Acme' }, WRITE)],
    ['deleteOAuthApplication', (api: Api) => api.deleteOAuthApplication(7, WRITE)],
  ])('%s answers under the idempotency key it was given', async (_name, call) => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
    await call(new Api('https://api.example.test', { baseFetch }))
    const [, init] = baseFetch.mock.calls[0]
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('the-key')
  })

  it.each([
    ['updateMe', (api: Api) => api.updateMe({ language: 'en' }, WRITE)],
    ['updateUser', (api: Api) => api.updateUser('u1', { is_active: false }, WRITE)],
    ['updateOAuthApplication', (api: Api) => api.updateOAuthApplication(7, { name: 'Acme' }, WRITE)],
    ['deleteOAuthApplication', (api: Api) => api.deleteOAuthApplication(7, WRITE)],
    ['approveOAuthApplication', (api: Api) => api.approveOAuthApplication(7, [], KEY, READ)],
    ['changeSetting', (api: Api) => api.changeSetting('theme', { type: 'bool', value: true }, READ)],
  ])('%s names the version it was made against', async (_name, call) => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    await call(new Api('https://api.example.test', { baseFetch }))
    const [, init] = baseFetch.mock.calls[0]
    expect(new Headers(init?.headers).get('If-Match')).toBe('"3"')
  })

  it('approves under both its idempotency key and the version it was made against', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    await new Api('https://api.example.test', { baseFetch }).approveOAuthApplication(7, [], KEY, {
      ...READ,
      'Idempotency-Key': 'a-hook-key',
    })
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

  // Held by the type checker, not at runtime: each line fails to compile unless the client refuses it.
  it('refuses at compile time a write that never decided its version or its key', async () => {
    const baseFetch = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    const api = new Api('https://api.example.test', { baseFetch })
    // @ts-expect-error - a hand-built If-Match is not ifMatch() or anyVersion()
    await api.updateMe({ language: 'en' }, { 'If-Match': '"3"' })
    // @ts-expect-error - nor are headers with no version at all
    await api.deleteOAuthApplication(7, {})
    // @ts-expect-error - a version without a key is refused too
    await api.updateOAuthApplication(7, { name: 'Acme' }, READ)
    // @ts-expect-error - a plain string is no idempotency key
    await api.withdrawOAuthApplication(7, 'the-key')
    expect(baseFetch).toHaveBeenCalledTimes(4)
  })
})
