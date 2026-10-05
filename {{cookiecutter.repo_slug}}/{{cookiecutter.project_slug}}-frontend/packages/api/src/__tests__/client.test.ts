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
