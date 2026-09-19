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
})
