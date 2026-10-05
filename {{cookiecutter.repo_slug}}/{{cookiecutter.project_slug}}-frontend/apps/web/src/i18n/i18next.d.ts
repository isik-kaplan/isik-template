import type { resources } from './config'

// Every key becomes a compile-time union, so a typo fails `lint:types` instead of rendering the key
// back to the visitor, which is what i18next does with one it cannot find.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: (typeof resources)['en']
  }
}
