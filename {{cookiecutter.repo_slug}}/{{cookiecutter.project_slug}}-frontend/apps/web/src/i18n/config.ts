import authEn from '../locales/en/auth.json'
import notFoundEn from '../locales/en/notFound.json'
import themeToggleEn from '../locales/en/themeToggle.json'
import type { InitOptions } from 'i18next'

// Only one language exists right now - kept as a flat resources object rather than a
// lodash-built cross product of languages x namespaces, since there's nothing to cross yet.
// Extra languages (see cookiecutter.json's "languages") regenerate this whole file - see
// hooks/post_gen_project.py - rather than growing this list by hand.
export const languages = ['en'] as const
export const namespaces = ['auth', 'themeToggle', 'notFound'] as const

export type Language = (typeof languages)[number]
export type Namespace = (typeof namespaces)[number]

const resources = {
  en: {
    auth: authEn,
    themeToggle: themeToggleEn,
    notFound: notFoundEn,
  },
} as const

export function getConfig(ns?: Namespace[], lng: Language = 'en'): InitOptions {
  return {
    fallbackLng: 'en',
    lng,
    ns: ns ?? namespaces,
    resources,
    // i18next escapes interpolated values by default, which React then renders literally - a
    // provider name came out as "Google&#x27;s".
    interpolation: { escapeValue: false },
  }
}
