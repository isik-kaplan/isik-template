import i18n from '@/lib/i18n'

import { text } from '../backend'
import fc from 'fast-check'

export type Sent = { method: string; path: string; body: unknown }

/** allauth's app API as a screen meets it: every request is kept, and `answer` decides what comes back. */
export function allauth(answer: (sent: Sent) => Response | Promise<Response>): Sent[] {
  const sent: Sent[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const body = await request.text()
    const one = {
      method: request.method,
      path: new URL(request.url).pathname,
      body: body ? JSON.parse(body) : undefined,
    }
    sent.push(one)
    return answer(one)
  }) as unknown as typeof fetch
  return sent
}

/** A gate the property opens once it has looked at the screen while the answer is still out. */
export function latch() {
  let open: () => void = () => undefined
  const shut = new Promise<void>((resolve) => (open = resolve))
  return { shut, open: () => open() }
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

// Keys are drawn at runtime, so the typed key union of i18next gets in the way here.
const translate = i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string
export const t = (key: string, options?: Record<string, unknown>) => translate(key, options)

/** Every kind of answer allauth gives a form, so a screen is driven through each of them per example. */
export const OUTCOMES = [
  'signed in',
  'throttled',
  'throttled for a while',
  'verify_email',
  'verify_phone',
  'mfa_authenticate',
  'refused about a field',
  'refused about nothing',
  'refused with an empty list',
  'refused without a list',
] as const
export type Outcome = (typeof OUTCOMES)[number]

/** What a refusal or a throttle carries, drawn per example. */
export const said = fc.record({
  message: text,
  code: fc.stringMatching(/^[a-z][a-z_]{2,15}$/),
  param: fc.constantFrom('email', 'password', 'phone', 'username', 'code'),
  seconds: fc.integer({ min: 1, max: 3600 }),
})
export type Said = typeof said extends fc.Arbitrary<infer T> ? T : never

export function answerFor(outcome: Outcome, s: Said): Response {
  switch (outcome) {
    case 'signed in':
      return json(200, {
        status: 200,
        data: { user: { id: 1, display: s.message, email: 'person@example.test' }, methods: [] },
        meta: { is_authenticated: true, session_token: 'a-token' },
      })
    case 'throttled':
      return json(429, { status: 429 })
    case 'throttled for a while':
      return json(429, { status: 429 }, { 'Retry-After': String(s.seconds) })
    case 'verify_email':
    case 'verify_phone':
      return json(401, {
        status: 401,
        data: { flows: [{ id: outcome, is_pending: true }] },
        meta: { is_authenticated: false },
      })
    case 'mfa_authenticate':
      return json(401, {
        status: 401,
        data: { flows: [{ id: outcome, is_pending: true, types: ['totp'] }] },
        meta: { is_authenticated: false },
      })
    case 'refused about a field':
      return json(400, { status: 400, errors: [{ message: s.message, code: s.code, param: s.param }] })
    case 'refused about nothing':
      return json(400, { status: 400, errors: [{ message: s.message, code: s.code }] })
    case 'refused with an empty list':
      return json(400, { status: 400, errors: [] })
    case 'refused without a list':
      return json(401, { status: 401, meta: { is_authenticated: false } })
  }
}

/** What a screen shows for a throttle, with or without a Retry-After. */
export function waitMessage(outcome: Outcome, s: Said): string | undefined {
  if (outcome === 'throttled') return t('tooManyRequests')
  if (outcome === 'throttled for a while') return t('tooManyRequestsFor', { count: s.seconds })
  return undefined
}

/** The drawn message, for a refusal that carries one. */
export function refusalMessage(outcome: Outcome, s: Said): string | undefined {
  return outcome === 'refused about a field' || outcome === 'refused about nothing' ? s.message : undefined
}

export const email = fc
  .stringMatching(/^[a-z][a-z0-9.]{0,8}[a-z0-9]@[a-z]{2,8}\.[a-z]{2,4}$/)
  .filter((value) => !value.includes('..'))

export const password = fc.stringMatching(/^[A-Za-z0-9!#%]{8,20}$/)

export const handle = fc.stringMatching(/^[a-z][a-z0-9_]{1,11}$/)

export const number = fc.stringMatching(/^\+[1-9][0-9]{7,13}$/)
