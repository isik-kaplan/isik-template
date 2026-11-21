import { cleanup } from '@testing-library/react'
import fc from 'fast-check'
import { afterEach, beforeEach, vi } from 'vitest'

// 25 runs for a developer and for CI alike: a number that differs between the two is one nobody can
// reason about, and a counterexample found only in a deeper run is one the gate never had.
fc.configureGlobal({ numRuns: 25 })

// Whatever SOCIAL_LOGIN__ONLY the environment holds; a test without passwords mocks @/lib/passwords.
process.env.{{ cookiecutter.config_prefix }}__SOCIAL_LOGIN__ONLY = 'false'

// With globals: false testing-library's auto-cleanup never registers. Once per property, not per example.
afterEach(() => {
  cleanup()
})

// jsdom has no matchMedia, which next-themes and sonner call on mount. Guarded: the server project has no window.
if (typeof window !== 'undefined')
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList

vi.mock('next/headers', async () => {
  const { requestHeaders, cookieJar } = await import('./support/requests')
  return { headers: () => Promise.resolve(requestHeaders.value), cookies: () => Promise.resolve(cookieJar) }
})

vi.mock('sonner', async () => {
  const { toast } = await import('./support/requests')
  return { toast, Toaster: () => null }
})

vi.mock('next/navigation', async (original) => {
  const { NOT_FOUND, REDIRECT, navigation } = await import('./support/requests')
  return {
    ...(await original<typeof import('next/navigation')>()),
    useRouter: () => ({ push: navigation.push, refresh: navigation.refresh, replace: navigation.replace }),
    usePathname: () => navigation.pathname,
    useSearchParams: () => navigation.searchParams,
    notFound: navigation.notFound,
    redirect: navigation.redirect,
    unstable_rethrow: (error: unknown) => {
      if (error instanceof Error && (error.message === NOT_FOUND || error.message.startsWith(REDIRECT))) throw error
    },
  }
})

// Once per property: fast-check runs all 25 examples inside one test, so an example starts holding
// whatever the one before it left. A property that needs a clean holder resets it at the top of its predicate.
beforeEach(async () => {
  const { requestHeaders, requestCookies, navigation, toast } = await import('./support/requests')
  requestHeaders.value = new Headers()
  requestCookies.value = {}
  for (const spy of [navigation.push, navigation.refresh, navigation.replace, navigation.notFound, navigation.redirect])
    spy.mockClear()
  navigation.searchParams = new URLSearchParams()
  navigation.pathname = '/'
  for (const spy of [toast.success, toast.error, toast.info]) spy.mockClear()
})

// connection() wants a request scope Next opens and vitest doesn't; it only marks the render dynamic.
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}))

// base-ui measures and points at elements jsdom never lays out; these stand in so its controls can be operated.
if (typeof document !== 'undefined' && !document.elementFromPoint) document.elementFromPoint = () => null

type Measurable = { getClientRects?: () => DOMRectList; getBoundingClientRect?: () => DOMRect }
for (const prototype of [globalThis.Text?.prototype, globalThis.Range?.prototype] as (Measurable | undefined)[]) {
  if (prototype && !prototype.getClientRects) {
    prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
    prototype.getBoundingClientRect = () => new DOMRect()
  }
}

if (typeof window !== 'undefined' && !window.PointerEvent) {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      Object.assign(this, { pointerId: init.pointerId ?? 1, pointerType: init.pointerType ?? 'mouse' })
    }
  } as unknown as typeof window.PointerEvent
}
