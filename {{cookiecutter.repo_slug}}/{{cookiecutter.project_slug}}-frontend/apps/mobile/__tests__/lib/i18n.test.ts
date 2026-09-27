import i18n from '@/lib/i18n'

describe('i18n', () => {
  it('initializes synchronously with English resources ready to use', () => {
    expect(i18n.language).toBe('en')
    expect(i18n.t('loginHeading')).toBe('Log in')
  })

  it('interpolates params into a resource string', () => {
    expect(i18n.t('homeHeadingWithEmail', { email: 'jane@test.test' })).toBe("You're logged in as jane@test.test")
  })

  it('falls back to the key itself for an unknown key', () => {
    expect(i18n.t('thisKeyDoesNotExist')).toBe('thisKeyDoesNotExist')
  })

  it('does not HTML-escape interpolated values (React already escapes on render)', () => {
    expect(i18n.t('homeHeadingWithEmail', { email: 'a&b' })).toBe("You're logged in as a&b")
  })
})
