import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('serverConfig', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads SENTRY.DSN from its own env var', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__SENTRY__DSN', 'https://example.test/1')

    const { serverConfig } = await import('@/config/server')

    expect(serverConfig().SENTRY.DSN).toBe('https://example.test/1')
  })

  it('defaults SENTRY.DSN to an empty string when unset', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__SENTRY__DSN', undefined)

    const { serverConfig } = await import('@/config/server')

    expect(serverConfig().SENTRY.DSN).toBe('')
  })

  it("reads the key nginx checks the frontend's fetches with from its own env var", async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__FRONTEND_KEY', 'the-key')

    const { serverConfig } = await import('@/config/server')

    expect(serverConfig().FRONTEND_KEY).toBe('the-key')
  })

  it('has no key when it is unset, so the fetches name nobody', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__FRONTEND_KEY', undefined)

    const { serverConfig } = await import('@/config/server')

    expect(serverConfig().FRONTEND_KEY).toBe('')
  })

  it('reads nothing at import, which is all next build does with it', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__FRONTEND_KEY', 'at-import')
    const { serverConfig } = await import('@/config/server')

    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__FRONTEND_KEY', 'at-first-use')

    expect(serverConfig().FRONTEND_KEY).toBe('at-first-use')
  })

  it('reads the environment once and answers from that afterwards', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__FRONTEND_KEY', 'first')
    const { serverConfig } = await import('@/config/server')
    const first = serverConfig()

    vi.stubEnv('{{ cookiecutter.config_prefix }}_SERVER__FRONTEND_KEY', 'second')

    expect(serverConfig()).toBe(first)
    expect(serverConfig().FRONTEND_KEY).toBe('first')
  })
})
