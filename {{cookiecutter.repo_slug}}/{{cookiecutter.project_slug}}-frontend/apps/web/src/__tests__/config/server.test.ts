import { describe, expect, it, vi } from 'vitest'

describe('SERVER_CONFIG', () => {
  it('reads SENTRY.DSN from its own env var, defaulting to an empty string', async () => {
    vi.stubEnv('TEST_PROJECT_SERVER__SENTRY__DSN', 'https://example.test/1')
    vi.resetModules()

    const { SERVER_CONFIG } = await import('@/config/server')

    expect(SERVER_CONFIG.SENTRY.DSN).toBe('https://example.test/1')

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('defaults SENTRY.DSN to an empty string when unset', async () => {
    vi.stubEnv('TEST_PROJECT_SERVER__SENTRY__DSN', undefined)
    vi.resetModules()

    const { SERVER_CONFIG } = await import('@/config/server')

    expect(SERVER_CONFIG.SENTRY.DSN).toBe('')

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
