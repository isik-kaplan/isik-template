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
