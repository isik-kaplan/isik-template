import { redirect, unstable_rethrow } from 'next/navigation'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const headersMock = vi.fn()
const sessionMock = vi.fn()
const getRequestOriginMock = vi.fn((_headers: Headers, _options: unknown) => 'http://api.example.test')

vi.mock('next/headers', () => ({ headers: () => headersMock() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }))
vi.mock('@isikk/core/next/request', () => ({
  getRequestOrigin: (headers: Headers, options: unknown) => getRequestOriginMock(headers, options),
}))
vi.mock('@{{ cookiecutter.repo_slug }}/auth-api', () => ({
  AuthApi: vi.fn().mockImplementation(() => ({ session: sessionMock })),
}))

async function freshGetSession() {
  vi.resetModules()
  return import('@/lib/getSession')
}

describe('getSession', () => {
  beforeEach(() => {
    headersMock.mockReturnValue(new Headers({ cookie: 'sessionid=abc' }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the session when the backend answers with one', async () => {
    sessionMock.mockResolvedValue({ data: { data: { user: { id: '1', username: 'jane', email: 'j@test.test' } } } })
    const { getSessionState } = await freshGetSession()

    expect(await getSessionState()).toEqual({
      session: { user: { id: '1', username: 'jane', email: 'j@test.test' } },
      pendingProviderSignup: false,
    })
  })

  it('resolves the auth origin with the local-dev-host detector', async () => {
    sessionMock.mockResolvedValue({ error: { data: {} } })
    const { getSession } = await freshGetSession()

    await getSession()

    expect(getRequestOriginMock).toHaveBeenCalledWith(expect.anything(), { isLocalDevHost: expect.any(Function) })
  })

  it('forwards no cookie header when the incoming request has none', async () => {
    headersMock.mockReturnValue(new Headers())
    sessionMock.mockResolvedValue({ error: { data: {} } })
    const { AuthApi } = await import('@{{ cookiecutter.repo_slug }}/auth-api')
    const { getSession } = await freshGetSession()

    await getSession()

    expect(AuthApi).toHaveBeenCalledWith('http://auth.api.example.test', { cookieHeader: undefined })
  })

  it('forwards the real cookie header when the incoming request has one', async () => {
    headersMock.mockReturnValue(new Headers({ cookie: 'sessionid=real-cookie' }))
    sessionMock.mockResolvedValue({ error: { data: {} } })
    const { AuthApi } = await import('@{{ cookiecutter.repo_slug }}/auth-api')
    const { getSession } = await freshGetSession()

    await getSession()

    expect(AuthApi).toHaveBeenCalledWith('http://auth.api.example.test', { cookieHeader: 'sessionid=real-cookie' })
  })

  it('returns null when the backend refuses with no pending provider signup', async () => {
    sessionMock.mockResolvedValue({ error: { data: {} } })
    const { getSession } = await freshGetSession()

    expect(await getSession()).toBeNull()
  })

  it('reports a pending provider signup from the refusal flows', async () => {
    sessionMock.mockResolvedValue({
      error: { data: { flows: [{ id: 'login' }, { id: 'provider_signup' }] } },
    })
    const { getSessionState } = await freshGetSession()

    expect(await getSessionState()).toEqual({ session: null, pendingProviderSignup: true })
  })

  it('does not report a pending provider signup for an unrelated flow', async () => {
    sessionMock.mockResolvedValue({ error: { data: { flows: [{ id: 'something_else' }] } } })
    const { getSessionState } = await freshGetSession()

    expect(await getSessionState()).toEqual({ session: null, pendingProviderSignup: false })
  })

  it('does not report a pending provider signup when there is no error at all', async () => {
    sessionMock.mockResolvedValue({ error: undefined })
    const { getSessionState } = await freshGetSession()

    expect(await getSessionState()).toEqual({ session: null, pendingProviderSignup: false })
  })

  it('does not report a pending provider signup when the refusal has no data', async () => {
    sessionMock.mockResolvedValue({ error: {} })
    const { getSessionState } = await freshGetSession()

    expect(await getSessionState()).toEqual({ session: null, pendingProviderSignup: false })
  })

  it('does not report a pending provider signup when the refusal has no flows', async () => {
    sessionMock.mockResolvedValue({ error: { data: {} } })
    const { getSessionState } = await freshGetSession()

    expect(await getSessionState()).toEqual({ session: null, pendingProviderSignup: false })
  })

  it('treats an unreachable backend as logged out rather than failing the render', async () => {
    sessionMock.mockRejectedValue(new Error('network down'))
    const { getSessionState } = await freshGetSession()

    expect(await getSessionState()).toEqual({ session: null, pendingProviderSignup: false })
    expect(unstable_rethrow).toHaveBeenCalled()
  })

  describe('redirectIfAuthenticated', () => {
    it('redirects to complete-signup when a provider signup is pending', async () => {
      sessionMock.mockResolvedValue({ error: { data: { flows: [{ id: 'provider_signup' }] } } })
      const { redirectIfAuthenticated } = await freshGetSession()

      await redirectIfAuthenticated()

      expect(redirect).toHaveBeenCalledWith('/auth/complete-signup')
    })

    it('redirects to "/" by default when already logged in', async () => {
      sessionMock.mockResolvedValue({ data: { data: { user: { id: '1', username: 'jane', email: 'j@test.test' } } } })
      const { redirectIfAuthenticated } = await freshGetSession()

      await redirectIfAuthenticated()

      expect(redirect).toHaveBeenCalledWith('/')
    })

    it('redirects to the given path when already logged in', async () => {
      sessionMock.mockResolvedValue({ data: { data: { user: { id: '1', username: 'jane', email: 'j@test.test' } } } })
      const { redirectIfAuthenticated } = await freshGetSession()

      await redirectIfAuthenticated('/dashboard')

      expect(redirect).toHaveBeenCalledWith('/dashboard')
    })

    it('does not redirect when neither logged in nor pending', async () => {
      sessionMock.mockResolvedValue({ error: { data: {} } })
      const { redirectIfAuthenticated } = await freshGetSession()

      await redirectIfAuthenticated()

      expect(redirect).not.toHaveBeenCalled()
    })
  })

  describe('requireSession', () => {
    it('returns the session when logged in', async () => {
      sessionMock.mockResolvedValue({ data: { data: { user: { id: '1', username: 'jane', email: 'j@test.test' } } } })
      const { requireSession } = await freshGetSession()

      expect(await requireSession()).toEqual({ user: { id: '1', username: 'jane', email: 'j@test.test' } })
      expect(redirect).not.toHaveBeenCalled()
    })

    it('redirects to the default login path when not logged in', async () => {
      sessionMock.mockResolvedValue({ error: { data: {} } })
      const { requireSession } = await freshGetSession()

      await requireSession()

      expect(redirect).toHaveBeenCalledWith('/auth/login')
    })

    it('redirects to a given path when not logged in', async () => {
      sessionMock.mockResolvedValue({ error: { data: {} } })
      const { requireSession } = await freshGetSession()

      await requireSession('/somewhere-else')

      expect(redirect).toHaveBeenCalledWith('/somewhere-else')
    })
  })
})
