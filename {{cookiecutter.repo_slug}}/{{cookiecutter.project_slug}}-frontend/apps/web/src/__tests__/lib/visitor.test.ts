import { visitorFetch } from '@/lib/visitor'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const serverConfig = vi.hoisted(() => ({ FRONTEND_KEY: 'the-key' }))
vi.mock('@/config/server', () => ({ SERVER_CONFIG: serverConfig }))

const baseFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'))

function sent() {
  return new Headers(baseFetch.mock.lastCall?.[1]?.headers)
}

describe('visitorFetch', () => {
  beforeEach(() => {
    baseFetch.mockClear()
    serverConfig.FRONTEND_KEY = 'the-key'
  })

  it('names the visitor nginx said the page is for, with the key that proves it is the frontend asking', async () => {
    const fetch = visitorFetch(new Headers({ 'x-client-ip': '203.0.113.7' }), baseFetch)

    await fetch('http://api.test.test/v0/users/me/', { headers: { Cookie: 'sessionid=abc' } })

    expect(baseFetch.mock.lastCall?.[0]).toBe('http://api.test.test/v0/users/me/')
    expect(sent().get('X-Frontend-Key')).toBe('the-key')
    expect(sent().get('X-Visitor-Ip')).toBe('203.0.113.7')
    expect(sent().get('Cookie')).toBe('sessionid=abc')
  })

  it('is the plain fetch without a key to prove it with', () => {
    serverConfig.FRONTEND_KEY = ''

    expect(visitorFetch(new Headers({ 'x-client-ip': '203.0.113.7' }), baseFetch)).toBe(baseFetch)
  })

  it('is the plain fetch when nginx named nobody', () => {
    expect(visitorFetch(new Headers(), baseFetch)).toBe(baseFetch)
  })

  it("is the platform's own fetch unless given one", async () => {
    const platform = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))

    await visitorFetch(new Headers({ 'x-client-ip': '203.0.113.7' }))('http://api.test.test/')

    expect(new Headers(platform.mock.lastCall?.[1]?.headers).get('X-Visitor-Ip')).toBe('203.0.113.7')
    platform.mockRestore()
  })
})
