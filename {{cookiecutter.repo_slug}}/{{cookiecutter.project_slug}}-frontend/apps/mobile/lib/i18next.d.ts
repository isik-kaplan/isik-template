import type en from './locales/en.json'

// Every key becomes a compile-time union, so a typo fails `lint:types` instead of rendering the key
// back to the user, which is what i18next does with one it cannot find.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}
