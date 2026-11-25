import { apiOrigin, authOrigin, webOrigin } from '@/lib/config'

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

describe('config', () => {
  // Set and put back one by one: Expo's transform reads the original process.env, so replacing it changes nothing.
  const { EXPO_PUBLIC_API_ORIGIN, EXPO_PUBLIC_AUTH_ORIGIN } = process.env

  afterEach(() => {
    // Assigning undefined would store the string "undefined".
    for (const [name, value] of Object.entries({ EXPO_PUBLIC_API_ORIGIN, EXPO_PUBLIC_AUTH_ORIGIN })) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('reads EXPO_PUBLIC_API_ORIGIN for apiOrigin()', () => {
    process.env.EXPO_PUBLIC_API_ORIGIN = 'http://api.example.test'
    expect(apiOrigin()).toBe('http://api.example.test')
  })

  it('reads EXPO_PUBLIC_AUTH_ORIGIN for authOrigin()', () => {
    process.env.EXPO_PUBLIC_AUTH_ORIGIN = 'http://auth.example.test'
    expect(authOrigin()).toBe('http://auth.example.test')
  })

  it('derives webOrigin() from the auth origin, dropping only the auth subdomain', () => {
    process.env.EXPO_PUBLIC_AUTH_ORIGIN = 'https://auth.auth-tools.example.test'
    expect(webOrigin()).toBe('https://auth-tools.example.test')
  })

  it('throws a clear error when EXPO_PUBLIC_API_ORIGIN is unset', () => {
    delete process.env.EXPO_PUBLIC_API_ORIGIN
    expect(() => apiOrigin()).toThrow('EXPO_PUBLIC_API_ORIGIN')
  })

  it('throws a clear error when EXPO_PUBLIC_AUTH_ORIGIN is unset', () => {
    delete process.env.EXPO_PUBLIC_AUTH_ORIGIN
    expect(() => authOrigin()).toThrow('EXPO_PUBLIC_AUTH_ORIGIN')
  })

  it('reads every variable by its full name, the only way a build inlines one', () => {
    const root = path.join(__dirname, '../..')
    const dynamic = ['app', 'lib', 'components', 'theme'].flatMap((dir) =>
      (readdirSync(path.join(root, dir), { recursive: true }) as string[])
        .filter((file) => /\.tsx?$/.test(file))
        .filter((file) => /process\.env\[/.test(readFileSync(path.join(root, dir, file), 'utf8')))
        .map((file) => `${dir}/${file}`)
    )
    expect(dynamic).toEqual([])
  })
})
