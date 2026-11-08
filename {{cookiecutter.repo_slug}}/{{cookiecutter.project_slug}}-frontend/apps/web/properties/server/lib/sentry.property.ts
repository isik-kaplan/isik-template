import { serverSentryOptions } from '@/lib/sentry'

import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const sentry = vi.hoisted(() => ({ DSN: '', TRACES_SAMPLE_RATE: '0' }))
vi.mock('@/config/server', () => ({ serverConfig: () => ({ SENTRY: sentry }) }))
vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'test-project.test' } }))

describe("the web server's Sentry", () => {
  test.prop([
    fc.webUrl(),
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
    fc.domain(),
  ])(
    "joins its traces only to this deployment's API, never to a host a visitor names",
    (dsn, rate, port, elsewhere) => {
      sentry.DSN = dsn
      sentry.TRACES_SAMPLE_RATE = String(rate)
      const options = serverSentryOptions()
      const [target] = options.tracePropagationTargets
      expect(options.dsn).toBe(dsn)
      expect(options.tracesSampleRate).toBe(rate)
      expect(target.test(`https://api.test-project.test${port ? `:${port}` : ''}/v0/x`)).toBe(true)
      expect(target.test(`https://api.test-projectXtest/v0/x`)).toBe(false)
      fc.pre(elsewhere !== 'test-project.test')
      expect(target.test(`https://api.${elsewhere}/v0/x`)).toBe(false)
    }
  )
})
