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

  it('resolves the device locale to a real second language, not just always en', () => {
    // Only meaningful once "languages" names more than one - with just "en", any working or
    // broken deviceLanguage() lands on the exact same "en", so this proves nothing then.
    const { SUPPORTED_LANGUAGES } = loadWithLocales([{ languageCode: 'en' }])
    const other = SUPPORTED_LANGUAGES.find((code: string) => code !== 'en')
    if (!other) return

    const { default: i18n } = loadWithLocales([{ languageCode: other }])

    expect(i18n.language).toBe(other)
  })

  it("loads that language's own resource bundle rather than silently falling back to English", () => {
    const { SUPPORTED_LANGUAGES } = loadWithLocales([{ languageCode: 'en' }])
    const other = SUPPORTED_LANGUAGES.find((code: string) => code !== 'en')
    if (!other) return

    const { default: i18n } = loadWithLocales([{ languageCode: other }])

    // Blank (not translated yet, see hooks/post_gen_project.py's own printout), not "Log in" -
    // the latter would mean this language's own bundle was dropped and fallbackLng served English
    // instead, which a real translation later filled in would hide just as effectively as passing.
    expect(i18n.t('loginHeading')).toBe('')
  })

  describe('setLanguage', () => {
    it('does nothing when the language is already the current one', async () => {
      const { default: i18n, setLanguage } = loadWithLocales([{ languageCode: 'en' }])
      const changeLanguageSpy = jest.spyOn(i18n, 'changeLanguage')

      setLanguage('en')
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Not just "i18n.language is still en" - changeLanguage('en') while already on "en" would
      // leave that exact same value too, proving nothing about whether it was actually skipped.
      expect(changeLanguageSpy).not.toHaveBeenCalled()
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
  })
})
