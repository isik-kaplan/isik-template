import type en from './locales/en.json'

// A key typo fails `lint:types` instead of rendering the raw key.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}
