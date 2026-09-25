import { apiOrigin, authOrigin } from '@/lib/config'

describe('config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('reads EXPO_PUBLIC_API_ORIGIN for apiOrigin()', () => {
    process.env.EXPO_PUBLIC_API_ORIGIN = 'http://api.example.test'
    expect(apiOrigin()).toBe('http://api.example.test')
  })

  it('reads EXPO_PUBLIC_AUTH_ORIGIN for authOrigin()', () => {
    process.env.EXPO_PUBLIC_AUTH_ORIGIN = 'http://auth.example.test'
    expect(authOrigin()).toBe('http://auth.example.test')
  })

  it('throws a clear error when EXPO_PUBLIC_API_ORIGIN is unset', () => {
    delete process.env.EXPO_PUBLIC_API_ORIGIN
    expect(() => apiOrigin()).toThrow('EXPO_PUBLIC_API_ORIGIN')
  })

  it('throws a clear error when EXPO_PUBLIC_AUTH_ORIGIN is unset', () => {
    delete process.env.EXPO_PUBLIC_AUTH_ORIGIN
    expect(() => authOrigin()).toThrow('EXPO_PUBLIC_AUTH_ORIGIN')
  })
})
