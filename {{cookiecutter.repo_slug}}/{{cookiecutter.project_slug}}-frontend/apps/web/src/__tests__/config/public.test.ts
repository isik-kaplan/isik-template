import { describe, expect, it, vi } from 'vitest'

// PublicConfigScript (unused by these tests) awaits next/server's connection() to force a
// per-request render - a real dependency in the app, but not one worth pulling into a unit test.
vi.mock('next/server', () => ({ connection: vi.fn() }))

describe('CONFIG (public)', () => {
  it('reads DOMAIN from its own env var', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}__DOMAIN', 'example.test')
    vi.resetModules()

    const { CONFIG, PublicConfigScript } = await import('@/config/public')

    expect(CONFIG.DOMAIN).toBe('example.test')
    expect(typeof PublicConfigScript).toBe('function')

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('leaves the OAuth provider off and names no social provider when neither is set', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}__DOMAIN', 'example.test')
    vi.resetModules()

    const { CONFIG } = await import('@/config/public')

    expect(CONFIG.OAUTH_PROVIDER.MODE).toBe('off')
    expect(CONFIG.SOCIAL_LOGIN.PROVIDERS).toEqual([])

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('reads the OAuth provider mode from its own variable', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}__DOMAIN', 'example.test')
    vi.stubEnv('{{ cookiecutter.config_prefix }}__OAUTH_PROVIDER__MODE', 'auto')
    vi.resetModules()

    const { CONFIG } = await import('@/config/public')

    expect(CONFIG.OAUTH_PROVIDER.MODE).toBe('auto')

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('reads the social login providers and icons as lists, empty when unset', async () => {
    vi.stubEnv('{{ cookiecutter.config_prefix }}__DOMAIN', 'example.test')
    vi.stubEnv('{{ cookiecutter.config_prefix }}__SOCIAL_LOGIN__PROVIDERS', 'github,openid_connect')
    vi.resetModules()

    const { CONFIG } = await import('@/config/public')

    expect(CONFIG.SOCIAL_LOGIN.PROVIDERS).toEqual(['github', 'openid_connect'])
    expect(CONFIG.SOCIAL_LOGIN.ICONS).toEqual([])

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
