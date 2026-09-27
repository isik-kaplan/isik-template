import en from './locales/en.json'
import * as Localization from 'expo-localization'
import i18next from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'

// Resources are supplied synchronously (no backend/language-detector plugin), so init() finishes
// before its own returned promise ever needs awaiting - t() works immediately after this module's
// top-level runs. Every screen imports useTranslation from here rather than straight from
// react-i18next, so that import is what actually triggers this initialization as a side effect -
// a screen rendered on its own in a test (bypassing app/_layout.tsx) still gets a working t().
export const SUPPORTED_LANGUAGES = ['en'] as const
type Language = (typeof SUPPORTED_LANGUAGES)[number]

function isSupported(code: string): code is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
}

// The device's own language, restricted to what this app actually ships - overridden once a
// signed-in user's own saved preference loads (see useAuthenticated.ts). With only one bundled
// language this always resolves to "en" regardless of the device's real locale - see
// hooks/post_gen_project.py for what this looks like once "languages" names more than one.
function deviceLanguage(): Language {
  for (const locale of Localization.getLocales()) {
    if (locale.languageCode && isSupported(locale.languageCode)) return locale.languageCode
  }
  return 'en'
}

i18next.use(initReactI18next).init({
  lng: deviceLanguage(),
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
})

export function setLanguage(language: string): void {
  if (isSupported(language) && language !== i18next.language) void i18next.changeLanguage(language)
}

export { useTranslation }
export default i18next
