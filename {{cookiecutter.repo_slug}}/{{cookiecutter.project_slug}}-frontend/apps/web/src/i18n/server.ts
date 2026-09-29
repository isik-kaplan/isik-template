import { getConfig } from './config'
import type { Language, Namespace } from './config'
import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next/initReactI18next'

// A fresh instance per call, not a shared module-level singleton - Server Components run
// concurrently across requests, and i18next's own instance holds mutable state (current
// language, loaded namespaces) that isn't safe to share across them.
async function initI18next(ns: Namespace[], language: Language) {
  const i18nextInstance = createInstance()
  await i18nextInstance.use(initReactI18next).init(getConfig(ns, language))
  return i18nextInstance
}

// `language` defaults to 'en' rather than requiring every caller to resolve one - most callers
// go through '@/i18n''s sUseTranslation(), which resolves the request's actual language (the
// signed-in user's preference, or the browser's - see lib/resolveLanguage.ts) and passes it here;
// this stays a plain, request-agnostic function so it's still trivial to unit-test directly.
// Stryker disable next-line StringLiteral: equivalent mutant. getConfig()'s own fallbackLng is
// always 'en' too, and i18next resolves a falsy lng through it regardless of this default's exact
// value - confirmed directly (i18next.init({ lng: '', fallbackLng: 'en' }).language is "en").
export async function useTranslation(ns: Namespace[], language: Language = 'en') {
  const i18nextInstance = await initI18next(ns, language)
  return {
    t: i18nextInstance.getFixedT(language, ns),
    i18n: i18nextInstance,
  }
}
