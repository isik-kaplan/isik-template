import en from './locales/en.json'
import * as Localization from 'expo-localization'
import i18next from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'

// Screens import useTranslation from here, not react-i18next, so a screen rendered alone in a test still runs init.
export const SUPPORTED_LANGUAGES = ['en'] as const
type Language = (typeof SUPPORTED_LANGUAGES)[number]

function isSupported(code: string): code is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
}

// Overridden once a signed-in user's saved preference loads.
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
