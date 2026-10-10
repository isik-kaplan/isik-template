import { serverApi } from '@/lib/serverApi'

import { describe, expect, it, vi } from 'vitest'

const createApi = vi.fn((origin: string, options: object) => ({ origin, options }))
vi.mock('@/lib/apiClients', () => ({ createApi: (origin: string, options: object) => createApi(origin, options) }))

vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'test.test' } }))

let cookie: string | undefined = 'sessionid=abc'
vi.mock('next/headers', () => ({
  headers: async () => new Headers(cookie === undefined ? { host: 'test.test' } : { host: 'test.test', cookie }),
}))

describe('serverApi', () => {
  it("builds the client against the request's api origin, forwarding its cookies", async () => {
    await serverApi()

    expect(createApi).toHaveBeenLastCalledWith('http://api.test.test', { cookieHeader: 'sessionid=abc' })
  })

  it('forwards no cookie header when the request carries none', async () => {
    cookie = undefined

    await serverApi()

    expect(createApi).toHaveBeenLastCalledWith('http://api.test.test', { cookieHeader: undefined })
  })
})
