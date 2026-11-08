import i18n from '@/lib/i18n'
import type en from '@/lib/locales/en.json'

import fc from 'fast-check'

// What an arbitrary draws; this fast-check has no fc.infer.
export type Drawn<A> = A extends fc.Arbitrary<infer T> ? T : never

export type Call = { method: string; path: string; body: unknown; headers: Headers }

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

/** Installs a fetch that answers each call with `answer`, and returns every call made, in order. */
export function serve(answer: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const text = await request.text()
    const call = {
      method: request.method,
      path: new URL(request.url).pathname,
      body: text ? JSON.parse(text) : undefined,
      headers: request.headers,
    }
    calls.push(call)
    return answer(call)
  }) as unknown as typeof fetch
  return calls
}

/** A promise settled from outside, so a property can let the screen go before an answer arrives. */
export function held<T>() {
  let release: (value: T) => void = () => undefined
  const promise = new Promise<T>((settle) => (release = settle))
  return { promise, release }
}

export const slug = fc.stringMatching(/^[a-z][a-z_]{1,11}$/)

export const message = fc.stringMatching(/^[A-Z][a-z]{1,9}( [a-z]{1,8}){0,3}\.$/)

export const email = fc
  .stringMatching(/^[a-z][a-z0-9.]{0,8}[a-z0-9]@[a-z]{2,8}\.[a-z]{2,4}$/)
  .filter((value) => !value.includes('..'))

export const phoneNumber = fc.stringMatching(/^\+[1-9][0-9]{7,13}$/)

export type Refused = 'refused about a field' | 'refused about nothing' | 'too many requests'
export const REFUSED: Refused[] = ['refused about a field', 'refused about nothing', 'too many requests']

/** What a refusal carries besides its kind: allauth's message and field, and a 429's wait. */
export const refusalDetails = fc.record(
  {
    message,
    code: slug,
    param: slug,
    retryAfter: fc.integer({ min: 1, max: 3600 }),
  },
  { requiredKeys: ['message', 'code'] }
)
export type RefusalDetails = Drawn<typeof refusalDetails>

export function refusal(kind: Refused, details: RefusalDetails): Response {
  if (kind === 'too many requests') {
    const wait: Record<string, string> = details.retryAfter ? { 'Retry-After': String(details.retryAfter) } : {}
    return json(429, { status: 429 }, wait)
  }
  const { message: said, code, param } = details
  const errors =
    kind === 'refused about a field' ? [param ? { message: said, code, param } : { message: said, code }] : []
  return json(400, { status: 400, errors })
}

/** What the screen should say to a refusal, given the key it falls back on. */
export function said(kind: Refused, details: RefusalDetails, fallback: keyof typeof en): string {
  if (kind === 'too many requests') {
    return details.retryAfter ? i18n.t('tooManyRequestsFor', { count: details.retryAfter }) : i18n.t('tooManyRequests')
  }
  return kind === 'refused about a field' ? details.message : i18n.t(fallback)
}

export const ok = (data: unknown, meta: Record<string, unknown> = {}) => json(200, { status: 200, data, meta })
