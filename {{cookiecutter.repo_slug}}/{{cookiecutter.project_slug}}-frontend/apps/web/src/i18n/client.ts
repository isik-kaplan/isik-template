'use client'

import { useEffect } from 'react'

import { useLanguage } from '@/lib/LanguageContext'

import { getConfig } from './config'
import type { Namespace } from './config'
import i18next from 'i18next'
import { initReactI18next, useTranslation as useTranslationOriginal } from 'react-i18next'

i18next.use(initReactI18next).init(getConfig())

// Re-exported: the bare 'i18next' import is uninitialized; this one guarantees the init above ran.
export { i18next }

// Import from here, not '@/i18n': that barrel reaches next/headers, which breaks any Client Component build.
export function useClientTranslation(ns: Namespace[]) {
  const language = useLanguage()
  // The client instance is a browser-wide singleton, so it catches up only after mount: a brief flash
  // of the default language.
  useEffect(() => {
    if (i18next.language !== language) {
      void i18next.changeLanguage(language)
    }
  }, [language])
  return useTranslationOriginal(ns)
}
