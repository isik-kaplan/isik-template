import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// globals: false means test files import their own vitest APIs, so testing-library's own
// auto-cleanup (which looks for a global afterEach) never fires - wire it up explicitly instead.
afterEach(() => {
  cleanup()
})

// jsdom has no layout engine, so it never implemented matchMedia - next-themes and sonner both
// call it unconditionally on mount to read the OS color scheme.
window.matchMedia ??= (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})
