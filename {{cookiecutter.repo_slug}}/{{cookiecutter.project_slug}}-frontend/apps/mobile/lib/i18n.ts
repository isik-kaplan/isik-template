import en from './locales/en.json'
import i18next from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'

// Resources are supplied synchronously (no backend/language-detector plugin), so init() finishes
// before its own returned promise ever needs awaiting - t() works immediately after this module's
// top-level runs. Every screen imports useTranslation from here rather than straight from
// react-i18next, so that import is what actually triggers this initialization as a side effect -
// a screen rendered on its own in a test (bypassing app/_layout.tsx) still gets a working t().
// Equivalent mutant on lng/fallbackLng either way: with only one bundled language, "en" resolves
// resources directly and fallbackLng - a safety net for a missing lng - never gets consulted at
// all, so nothing here observes their exact values, only that resolution succeeds either way.
// Stryker disable StringLiteral
i18next.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
})
// Stryker restore StringLiteral

export { useTranslation }
export default i18next
