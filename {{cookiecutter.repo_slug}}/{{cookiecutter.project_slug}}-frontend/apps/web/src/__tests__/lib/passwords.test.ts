import { describe, expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({ SOCIAL_LOGIN: { ONLY: false } }))
vi.mock('@/config/public', () => ({ CONFIG }))

describe('passwordsSignIn', () => {
  it('is true unless sign-in is through providers only', async () => {
    const { passwordsSignIn } = await import('@/lib/passwords')

    expect(passwordsSignIn()).toBe(true)
    CONFIG.SOCIAL_LOGIN.ONLY = true
    expect(passwordsSignIn()).toBe(false)
  })
})
