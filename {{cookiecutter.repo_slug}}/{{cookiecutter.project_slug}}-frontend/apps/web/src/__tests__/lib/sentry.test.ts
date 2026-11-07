import { serverSentryOptions } from '@/lib/sentry'

import { describe, expect, it, vi } from 'vitest'

const SENTRY = { DSN: 'https://key@sentry.example.test/1', TRACES_SAMPLE_RATE: '0.25' }
vi.mock('@/config/server', () => ({ serverConfig: () => ({ SENTRY }) }))
vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'example.test' } }))

describe('serverSentryOptions', () => {
  it('reads the DSN and the rate from the runtime config', () => {
    const { dsn, tracesSampleRate } = serverSentryOptions()

    expect(dsn).toBe(SENTRY.DSN)
    expect(tracesSampleRate).toBe(0.25)
  })

  it.each(['https://api.example.test/v0/users/me/', 'http://api.example.test:8000/v0/'])(
    "joins a trace to the call to this deployment's API: %s",
    (url) => {
      expect(serverSentryOptions().tracePropagationTargets.some((target) => target.test(url))).toBe(true)
    }
  )

  it.each([
    'https://auth.example.test/',
    'https://api.example.test.attacker.test/',
    'https://api.exampleXtest/',
    'https://evil.test/https://api.example.test/',
    'https://api.example.test',
  ])('never sends the trace header anywhere else: %s', (url) => {
    expect(serverSentryOptions().tracePropagationTargets.some((target) => target.test(url))).toBe(false)
  })
})
