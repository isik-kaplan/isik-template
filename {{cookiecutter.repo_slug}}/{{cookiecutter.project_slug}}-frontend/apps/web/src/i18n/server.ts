import { getConfig } from './config'
import type { Namespace } from './config'
import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next/initReactI18next'

// A fresh instance per call, not a shared module-level singleton - Server Components run
// concurrently across requests, and i18next's own instance holds mutable state (current
// language, loaded namespaces) that isn't safe to share across them.
async function initI18next(ns: Namespace[]) {
  const i18nextInstance = createInstance()
  await i18nextInstance.use(initReactI18next).init(getConfig(ns))
  return i18nextInstance
}

export async function useTranslation(ns: Namespace[]) {
  const i18nextInstance = await initI18next(ns)
  return {
    // Stryker disable next-line StringLiteral: equivalent mutant. 'en' is both the only language
    // and getConfig()'s own fallbackLng, so a fixed translator for any other locale string
    // resolves through that same fallback to the exact same 'en' resources.
    t: i18nextInstance.getFixedT('en', ns),
    i18n: i18nextInstance,
  }
}
