import { vi } from 'vitest'

// What `next/headers`, `next/navigation` and sonner answer here. The suite's own holders rather than the
// example suite's: the two are separate oracles, and one reaching into the other's fixtures would fail
// for the other's reasons.
export const requestHeaders = { value: new Headers() }

export const requestCookies: { value: Record<string, string> } = { value: {} }

export const cookieJar = {
  get(name: string) {
    return name in requestCookies.value ? { name, value: requestCookies.value[name] } : undefined
  },
  getAll() {
    return Object.entries(requestCookies.value).map(([name, value]) => ({ name, value }))
  },
  has(name: string) {
    return name in requestCookies.value
  },
}

export const NOT_FOUND = 'NEXT_NOT_FOUND'
export const REDIRECT = 'NEXT_REDIRECT'

export const navigation = {
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  // They throw because that is how Next stops a render: a silent spy would let a component carry on
  // past a 404, and the property would be asserting about a page that cannot exist.
  notFound: vi.fn((): never => {
    throw new Error(NOT_FOUND)
  }),
  redirect: vi.fn((url: string): never => {
    throw new Error(`${REDIRECT}:${url}`)
  }),
  pathname: '/',
  searchParams: new URLSearchParams(),
}

export const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }

/** A fetch spy's calls, typed as fetch is called: vi.fn() of a function taking nothing records `[]`. */
export const calls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls as unknown as [RequestInfo | URL, RequestInit?][]
