import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// With globals: false testing-library's auto-cleanup never registers, so it is wired up here.
afterEach(() => {
  cleanup()
})

// jsdom has no matchMedia, which next-themes and sonner call on mount. Guarded: the server project has no window.
if (typeof window !== 'undefined')
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
