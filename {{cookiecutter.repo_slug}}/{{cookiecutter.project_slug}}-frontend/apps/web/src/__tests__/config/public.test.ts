import { describe, expect, it, vi } from 'vitest'

// PublicConfigScript (unused by these tests) awaits next/server's connection() to force a
// per-request render - a real dependency in the app, but not one worth pulling into a unit test.
vi.mock('next/server', () => ({ connection: vi.fn() }))

describe('CONFIG (public)', () => {
  it('reads DOMAIN from its own env var', async () => {
    vi.stubEnv('TEST_PROJECT__DOMAIN', 'example.test')
    vi.resetModules()

    const { CONFIG, PublicConfigScript } = await import('@/config/public')

    expect(CONFIG.DOMAIN).toBe('example.test')
    expect(typeof PublicConfigScript).toBe('function')

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
