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
})
