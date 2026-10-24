import authEn from '../locales/en/auth.json'
import commonEn from '../locales/en/common.json'
import legalEn from '../locales/en/legal.json'
import notFoundEn from '../locales/en/notFound.json'
import themeToggleEn from '../locales/en/themeToggle.json'
import type { InitOptions, TFunction } from 'i18next'

// English only: extra languages regenerate this whole file at bake time.
export const languages = ['en'] as const
export const namespaces = ['auth', 'common', 'themeToggle', 'notFound', 'legal'] as const

export type Language = (typeof languages)[number]
export type Namespace = (typeof namespaces)[number]

export const resources = {
  en: {
    auth: authEn,
    common: commonEn,
    themeToggle: themeToggleEn,
    notFound: notFoundEn,
    legal: legalEn,
  },
} as const

export function getConfig(ns?: Namespace[], lng: Language = 'en'): InitOptions {
  return {
    fallbackLng: 'en',
    lng,
    ns: ns ?? namespaces,
    resources,
    // i18next escapes interpolated values by default, which React then renders literally.
    interpolation: { escapeValue: false },
  }
}

// What a function handed `t` should take: `(key: string) => string` lets a mistyped key through.
export type Translate = TFunction<Namespace[]>
