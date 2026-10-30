import { getApi } from '@/lib/api'

import { Api } from '@{{ cookiecutter.repo_slug }}/api'

import * as SecureStore from 'expo-secure-store'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn() }))

describe('api', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_ORIGIN = 'http://api.example.test'
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('stored-token')
    global.fetch = jest.fn(async () => new Response('{}')) as unknown as typeof fetch
  })

  it('is one real Api, calling the API origin signed in as the session', async () => {
    const api = getApi()
    expect(api).toBeInstanceOf(Api)
    expect(getApi()).toBe(api)
    await api.me()
    const [request, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(String(request instanceof Request ? request.url : request)).toBe('http://api.example.test/v0/users/me/')
    expect(new Headers(init.headers).get('X-Session-Token')).toBe('stored-token')
  })
})
