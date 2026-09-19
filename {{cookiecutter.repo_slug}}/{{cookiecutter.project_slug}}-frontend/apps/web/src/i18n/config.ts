import authEn from '../locales/en/auth.json'
import themeToggleEn from '../locales/en/themeToggle.json'
import type { InitOptions } from 'i18next'

// Only one language exists right now - kept as a flat resources object rather than a
// lodash-built cross product of languages x namespaces, since there's nothing to cross yet.
// Revisit that shape if a second language shows up.
export const languages = ['en'] as const
export const namespaces = ['auth', 'themeToggle'] as const

export type Language = (typeof languages)[number]
export type Namespace = (typeof namespaces)[number]

const resources = {
  en: {
    auth: authEn,
    themeToggle: themeToggleEn,
  },
} as const

export function getConfig(ns?: Namespace[]): InitOptions {
  return {
    fallbackLng: 'en',
    lng: 'en',
    ns: ns ?? namespaces,
    resources,
    // i18next escapes interpolated values by default, which React then renders literally - a
    // provider name came out as "Google&#x27;s".
    interpolation: { escapeValue: false },
  }
}
