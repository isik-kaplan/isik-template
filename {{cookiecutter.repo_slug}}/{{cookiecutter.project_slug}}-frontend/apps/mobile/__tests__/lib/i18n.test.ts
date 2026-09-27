function loadWithLocales(locales: { languageCode: string | null }[]) {
  jest.resetModules()
  jest.doMock('expo-localization', () => ({ getLocales: () => locales }))
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/lib/i18n')
}

describe('i18n', () => {
  afterEach(() => {
    jest.dontMock('expo-localization')
  })

  it('initializes synchronously with English resources ready to use', () => {
    const { default: i18n } = loadWithLocales([{ languageCode: 'en' }])
    expect(i18n.language).toBe('en')
    expect(i18n.t('loginHeading')).toBe('Log in')
  })

  it('interpolates params into a resource string', () => {
    const { default: i18n } = loadWithLocales([{ languageCode: 'en' }])
    expect(i18n.t('homeHeadingWithEmail', { email: 'jane@test.test' })).toBe("You're logged in as jane@test.test")
  })

  it('falls back to the key itself for an unknown key', () => {
    const { default: i18n } = loadWithLocales([{ languageCode: 'en' }])
    expect(i18n.t('thisKeyDoesNotExist')).toBe('thisKeyDoesNotExist')
  })

  it('does not HTML-escape interpolated values (React already escapes on render)', () => {
    const { default: i18n } = loadWithLocales([{ languageCode: 'en' }])
    expect(i18n.t('homeHeadingWithEmail', { email: 'a&b' })).toBe("You're logged in as a&b")
  })

  it('falls back to English when the device locale is not one this app ships', () => {
    const { default: i18n } = loadWithLocales([{ languageCode: 'de' }])
    expect(i18n.language).toBe('en')
  })

  it('falls back to English when the device reports no usable locale at all', () => {
    const { default: i18n } = loadWithLocales([{ languageCode: null }])
    expect(i18n.language).toBe('en')
  })

  it('falls back to English when the device reports no locales at all', () => {
    const { default: i18n } = loadWithLocales([])
    expect(i18n.language).toBe('en')
  })

  it('picks the first supported locale among several', () => {
    const { default: i18n } = loadWithLocales([{ languageCode: 'de' }, { languageCode: 'en' }])
    expect(i18n.language).toBe('en')
  })

  describe('setLanguage', () => {
    it('does nothing when the language is already the current one', async () => {
      const { default: i18n, setLanguage } = loadWithLocales([{ languageCode: 'en' }])
      setLanguage('en')
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(i18n.language).toBe('en')
    })

    it('switches to a different supported language, when this app ships more than one', async () => {
      // Only meaningful once "languages" names more than one - with just "en", there is no other
      // supported language to prove an actual switch against, so this is a no-op assertion then.
      const { default: i18n, setLanguage, SUPPORTED_LANGUAGES } = loadWithLocales([{ languageCode: 'de' }])
      const other = SUPPORTED_LANGUAGES.find((code: string) => code !== i18n.language)
      if (!other) return
      setLanguage(other)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(i18n.language).toBe(other)
    })

    it('ignores a language this app does not ship', async () => {
      const { default: i18n, setLanguage } = loadWithLocales([{ languageCode: 'en' }])
      setLanguage('de')
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(i18n.language).toBe('en')
    })

    it('does nothing when already set to that language', async () => {
      const { default: i18n, setLanguage } = loadWithLocales([{ languageCode: 'en' }])
      const before = i18n.language
      setLanguage('en')
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(i18n.language).toBe(before)
    })
  })
})
