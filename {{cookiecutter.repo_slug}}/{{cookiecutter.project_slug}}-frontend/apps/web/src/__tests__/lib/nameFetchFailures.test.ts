import { nameFetchFailures } from '@/lib/nameFetchFailures'

import { fc, test as propertyTest } from '@fast-check/vitest'
import { describe, expect, it, vi } from 'vitest'

// The shape undici throws: a bare TypeError whose own `cause` carries the system error code.
function undiciFailure(code?: string) {
  return Object.assign(new TypeError('fetch failed'), code ? { cause: { code } } : {})
}

async function thrownBy(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('expected a rejection')
}

describe('nameFetchFailures', () => {
  it('passes a response through untouched, with the arguments it was given', async () => {
    const response = new Response('ok')
    const baseFetch = vi.fn(async () => response)
    const init = { method: 'POST' }

    await expect(nameFetchFailures(baseFetch)('http://api.test/v0/users/', init)).resolves.toBe(response)
    expect(baseFetch).toHaveBeenCalledWith('http://api.test/v0/users/', init)
  })

  it('names the method, the address and the system code of a failure', async () => {
    const cause = undiciFailure('ECONNREFUSED')
    const named = nameFetchFailures(vi.fn(async () => Promise.reject(cause)))

    const error = await thrownBy(named('http://api.test/v0/users/', { method: 'PATCH' }))

    expect(error.message).toBe('fetch failed: PATCH http://api.test/v0/users/ (ECONNREFUSED)')
    // The original is kept where undici put the real reason, not replaced by the name.
    expect(error.cause).toBe(cause)
  })

  it('reads the method and address off a Request rather than off init', async () => {
    const named = nameFetchFailures(vi.fn(async () => Promise.reject(undiciFailure())))

    const error = await thrownBy(named(new Request('http://auth.test/session', { method: 'DELETE' })))

    expect(error.message).toBe('fetch failed: DELETE http://auth.test/session')
  })

  it('assumes GET when nothing says otherwise, as fetch itself does', async () => {
    const named = nameFetchFailures(vi.fn(async () => Promise.reject(undiciFailure())))

    expect((await thrownBy(named(new URL('http://api.test/v0/')))).message).toBe(
      'fetch failed: GET http://api.test/v0/'
    )
    expect((await thrownBy(named('http://api.test/v0/', {}))).message).toBe('fetch failed: GET http://api.test/v0/')
  })

  it('names a failure that carries no cause at all', async () => {
    const named = nameFetchFailures(vi.fn(async () => Promise.reject(undefined)))

    expect((await thrownBy(named('http://api.test/'))).message).toBe('fetch failed: GET http://api.test/')
  })

  propertyTest.prop([fc.webUrl(), fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE')])(
    'two different calls never fail with the same message',
    async (url, method) => {
      const named = nameFetchFailures(vi.fn(async () => Promise.reject(undiciFailure())))

      const [one, other] = await Promise.all([
        thrownBy(named(url, { method })),
        thrownBy(named(`${url}#other`, { method })),
      ])

      expect(one.message).not.toBe(other.message)
    }
  )
})
