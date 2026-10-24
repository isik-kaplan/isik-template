import type { resources } from './config'

// Keys become a compile-time union, so a typo fails `lint:types` instead of rendering as itself.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: (typeof resources)['en']
  }
}
