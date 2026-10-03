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

// Stryker disable next-line BlockStatement: equivalent mutant with only one supported language -
// both callers below (deviceLanguage's `if`, setLanguage's `if`) are already equivalent-dead
// regardless of what this returns, so an empty body changes nothing observable. Real once
// "languages" names more than one.
function isSupported(code: string): code is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
}

// The device's own language, restricted to what this app actually ships - overridden once a
// signed-in user's own saved preference loads (see useAuthenticated.ts). With only one bundled
// language this always resolves to "en" regardless of the device's real locale - see
// hooks/post_gen_project.py for what this looks like once "languages" names more than one.
// Stryker disable next-line BlockStatement: equivalent mutant, same single-language reason as the
// comments inside this function - an empty body returns undefined for `lng`, which i18next
// resolves through fallbackLng to the exact same "en" regardless.
function deviceLanguage(): Language {
  // Stryker disable next-line BlockStatement: equivalent mutant, same reason as the `if` just
  // inside - an empty loop body still falls through to the identical "en" fallback below.
  for (const locale of Localization.getLocales()) {
    // Stryker disable next-line ConditionalExpression: equivalent mutant with only one supported
    // language - isSupported() can only ever answer true for "en", the same value the fallback
    // below already returns, so forcing this branch to never run changes nothing observable. Real
    // once "languages" names more than one - see hooks/post_gen_project.py for that version.
    if (locale.languageCode && isSupported(locale.languageCode)) return locale.languageCode
  }
  // Stryker disable next-line StringLiteral: equivalent mutant, the same way and for the same
  // reason as the fallbackLng comment below - i18next resolves an empty lng through fallbackLng
  // regardless of what this placeholder actually is, landing on "en" either way.
  return 'en'
}

i18next.use(initReactI18next).init({
  lng: deviceLanguage(),
  // Stryker disable next-line StringLiteral: equivalent mutant. deviceLanguage() only ever
  // returns a language this app actually bundles resources for, so a missing *key* inside that
  // bundle is the only thing fallbackLng could ever catch here - and every key that exists in
  // "en" exists in every other bundle too (blank until translated, never absent - see
  // hooks/post_gen_project.py), so that never happens either.
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
})

// Stryker disable next-line BlockStatement: equivalent mutant, same single-language reason as the
// `if` inside - its condition is already always false, so an empty body changes nothing a caller
// could observe. Real once "languages" names more than one.
export function setLanguage(language: string): void {
  // Stryker disable next-line ConditionalExpression: equivalent mutant with only one supported
  // language - isSupported(language) is only ever true for "en", and i18next.language is always
  // "en" too (nothing else to switch to), so the two halves can never both be true at once - this
  // condition is already always false, same as a literal `if (false)`. Real once "languages"
  // names more than one.
  // istanbul ignore next -- same single-language reason: the condition above can never be true,
  // so this call can never execute, in this configuration. Real once "languages" names more than
  // one, where the "switches to a different supported language" test below exercises it.
  if (isSupported(language) && language !== i18next.language) void i18next.changeLanguage(language)
}

export { useTranslation }
export default i18next
