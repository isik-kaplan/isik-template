import { UNREACHABLE_STATUS, answered, createAuthApi, getAuthApi, holdsSession, signedInFetch } from '@/lib/session'

import { AppAuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import * as SecureStore from 'expo-secure-store'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }))
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

function mockFetch(body: unknown) {
  global.fetch = jest.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch
}

describe('session', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.EXPO_PUBLIC_AUTH_ORIGIN = 'http://auth.example.test'
  })

  it('reads the token from expo-secure-store on every request', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('stored-token')
    mockFetch({ status: 200, data: {}, meta: {} })
    await createAuthApi('http://auth.example.test').session()
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('session_token')
  })

  it('writes a fresh session_token to expo-secure-store', async () => {
    mockFetch({ status: 200, data: { user: {} }, meta: { session_token: 'new-token' } })
    await createAuthApi('http://auth.example.test').session()
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('session_token', 'new-token')
  })

  it('clears the stored token on logout', async () => {
    mockFetch({ status: 200, data: {}, meta: {} })
    await createAuthApi('http://auth.example.test').logout()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('session_token')
  })

  it('sends the app to prove it is them when the backend asks for that, and passes the answer on', async () => {
    global.fetch = jest.fn(
      async () => new Response('{}', { status: 401, headers: { 'X-Reauthentication-Required': '1' } })
    ) as unknown as typeof fetch
    const { response } = await createAuthApi('http://auth.example.test').addEmail('second@example.test')
    expect(mockPush).toHaveBeenCalledWith('/prove')
    expect(response.status).toBe(401)
  })

  it('goes nowhere on an ordinary answer', async () => {
    mockFetch({ status: 200, data: {}, meta: {} })
    await createAuthApi('http://auth.example.test').session()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("signs the backend's own API calls with the stored session token", async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('stored-token')
    mockFetch({})
    await signedInFetch('http://api.example.test/v0/users/me/', { headers: { Accept: 'application/json' } })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(Object.fromEntries(init.headers)).toEqual({
      accept: 'application/json',
      'x-session-token': 'stored-token',
    })
  })

  it('sends no session token while signed out', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
    mockFetch({})
    await signedInFetch('http://api.example.test/v0/users/me/')
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(Object.fromEntries(init.headers)).toEqual({})
  })

  it("sends the app to prove it is them when the backend's own API asks", async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('stored-token')
    global.fetch = jest.fn(
      async () => new Response('{}', { status: 401, headers: { 'X-Reauthentication-Required': '1' } })
    ) as unknown as typeof fetch
    await signedInFetch('http://api.example.test/v0/users/me/')
    expect(mockPush).toHaveBeenCalledWith('/prove')
  })

  it('getAuthApi() returns the same real AppAuthApi instance on repeated calls', () => {
    const first = getAuthApi()
    expect(first).toBeInstanceOf(AppAuthApi)
    expect(getAuthApi()).toBe(first)
  })

  it('answers a request that never reached the server with a 503 the screens already handle', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed')
    }) as unknown as typeof fetch

    const response = await signedInFetch('http://api.example.test/v0/users/me/')

    expect(response.status).toBe(UNREACHABLE_STATUS)
    expect(await response.json()).toEqual({ unreachable: true })
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('passes an answer that did arrive on untouched', async () => {
    const arrived = new Response('{}', { status: 418 })
    expect(await answered(async () => arrived)).toBe(arrived)
  })

  it('leaves an abort, which the caller asked for, to throw', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    await expect(
      answered(async () => {
        throw abort
      })
    ).rejects.toBe(abort)
  })

  it('says whether this phone holds a session token', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('stored-token').mockResolvedValueOnce(null)
    expect(await holdsSession()).toBe(true)
    expect(await holdsSession()).toBe(false)
  })
})
