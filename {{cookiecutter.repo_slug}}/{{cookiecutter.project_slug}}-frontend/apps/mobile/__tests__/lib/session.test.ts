import { createAuthApi, getAuthApi } from '@/lib/session'

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

  it('getAuthApi() returns the same real AppAuthApi instance on repeated calls', () => {
    const first = getAuthApi()
    expect(first).toBeInstanceOf(AppAuthApi)
    expect(getAuthApi()).toBe(first)
  })
})
