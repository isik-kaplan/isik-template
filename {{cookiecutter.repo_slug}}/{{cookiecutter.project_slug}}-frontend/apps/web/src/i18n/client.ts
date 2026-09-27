'use client'

import { useEffect } from 'react'

import { useLanguage } from '@/lib/LanguageContext'

import { getConfig } from './config'
import type { Namespace } from './config'
import i18next from 'i18next'
import { initReactI18next, useTranslation as useTranslationOriginal } from 'react-i18next'

i18next.use(initReactI18next).init(getConfig())

// Re-exported, not imported straight from 'i18next' elsewhere (LanguageSwitcher.tsx) - importing
// the bare package gets an uninitialized instance; importing this module guarantees the init
// above already ran as a side effect of the import itself.
export { i18next }

// Every caller imports this straight from here, not '@/i18n' - that barrel also exports the
// server-only sUseTranslation() (which reaches next/headers through getSession.ts), and Next
// treats anything reachable through a shared module as unbuildable from a Client Component
// regardless of which named export a given file actually uses.
export function useClientTranslation(ns: Namespace[]) {
  const language = useLanguage()
  // Server Components resolve their language per request (see '@/i18n''s sUseTranslation()); this
  // shared client-side instance is a browser-wide singleton instead, so it can only catch up
  // after mount - a signed-in user whose preference isn't English sees a brief flash of whatever
  // this instance's own default is before this effect corrects it. Fixing that fully needs
  // per-request client bootstrapping (URL-segment routing or similar), deliberately out of scope.
  useEffect(() => {
    if (i18next.language !== language) {
      void i18next.changeLanguage(language)
    }
  }, [language])
  return useTranslationOriginal(ns)
}
