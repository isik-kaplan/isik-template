import { appleSignInEnabled, googleSignInEnabled } from '@/lib/socialProviders'

describe('socialProviders', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SOCIAL_LOGIN_PROVIDERS
  })

  it('turns neither native sign-in on when the build names no provider', () => {
    expect(googleSignInEnabled()).toBe(false)
    expect(appleSignInEnabled()).toBe(false)
  })

  it('turns on only the providers the build names, ignoring the ones with no native SDK', () => {
    process.env.EXPO_PUBLIC_SOCIAL_LOGIN_PROVIDERS = 'github, apple ,openid_connect'

    expect(googleSignInEnabled()).toBe(false)
    expect(appleSignInEnabled()).toBe(true)
  })

  it('matches a whole provider id, not a part of one', () => {
    process.env.EXPO_PUBLIC_SOCIAL_LOGIN_PROVIDERS = 'googleplus,apple_id'

    expect(googleSignInEnabled()).toBe(false)
    expect(appleSignInEnabled()).toBe(false)
  })

  it('turns google on by its own id', () => {
    process.env.EXPO_PUBLIC_SOCIAL_LOGIN_PROVIDERS = 'google'

    expect(googleSignInEnabled()).toBe(true)
  })
})
