'use client'

import { type ReactNode, createContext, useContext } from 'react'

import type { Language } from '@/i18n/config'

const LanguageContext = createContext<Language>('en')

export function LanguageProvider({ language, children }: { language: Language; children: ReactNode }) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>
}

export function useLanguage(): Language {
  return useContext(LanguageContext)
}
