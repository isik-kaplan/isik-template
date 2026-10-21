import { describe, expect, it, vi } from 'vitest'

describe('SERVER_CONFIG', () => {
  it('reads SENTRY.DSN from its own env var, defaulting to an empty string', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__SENTRY__DSN', 'https://example.test/1')
    vi.resetModules()

    const { SERVER_CONFIG } = await import('@/config/server')

    expect(SERVER_CONFIG.SENTRY.DSN).toBe('https://example.test/1')

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('defaults SENTRY.DSN to an empty string when unset', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__SENTRY__DSN', undefined)
    vi.resetModules()

    const { SERVER_CONFIG } = await import('@/config/server')

    expect(SERVER_CONFIG.SENTRY.DSN).toBe('')

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("reads the key nginx checks the frontend's fetches with from its own env var", async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__FRONTEND_KEY', 'the-key')
    vi.resetModules()

    const { SERVER_CONFIG } = await import('@/config/server')

    expect(SERVER_CONFIG.FRONTEND_KEY).toBe('the-key')

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('has no key when it is unset, so the fetches name nobody', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__FRONTEND_KEY', undefined)
    vi.resetModules()

    const { SERVER_CONFIG } = await import('@/config/server')

    expect(SERVER_CONFIG.FRONTEND_KEY).toBe('')

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
