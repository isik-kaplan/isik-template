import { getConfig } from './config'
import type { Language, Namespace } from './config'
import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next/initReactI18next'

// A fresh instance per call: an i18next instance holds the current language, unsafe across concurrent requests.
async function initI18next(ns: Namespace[], language: Language) {
  const i18nextInstance = createInstance()
  await i18nextInstance.use(initReactI18next).init(getConfig(ns, language))
  return i18nextInstance
}

// Request-agnostic: '@/i18n''s sUseTranslation() resolves the language and passes it.
export async function useTranslation(ns: Namespace[], language: Language = 'en') {
  const i18nextInstance = await initI18next(ns, language)
  return {
    t: i18nextInstance.getFixedT(language, ns),
    i18n: i18nextInstance,
  }
}
