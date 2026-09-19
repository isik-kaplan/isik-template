import { createApi, createAuthApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { authOrigin } from '@/lib/authOrigin'

// The window.{{ cookiecutter.project_slug }} type itself is declared in global.d.ts, not here - an
// ambient declaration file is what TypeScript expects a `Window` augmentation to live in.

// lib.dom.d.ts puts `console` on `typeof globalThis`, not on the `Window` interface itself - the
// real global `window` only has it via `declare var window: Window & typeof globalThis`, so a
// plain `Window`-typed parameter needs the same intersection or `.console` won't resolve.
type WindowLike = Window & typeof globalThis

// Silenced by default so a production console isn't full of framework/library noise a visitor
// never asked for - `window.{{ cookiecutter.project_slug }}.debug(true)` (set below) turns it back
// on for whoever actually wants it, without a rebuild.
let logsEnabled = false

export function noDirectConsoleLog(window: WindowLike) {
  const original = {
    log: window.console.log.bind(window.console),
    info: window.console.info.bind(window.console),
    warn: window.console.warn.bind(window.console),
    error: window.console.error.bind(window.console),
  }

  const conditional =
    (method: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (logsEnabled) method(...args)
    }

  window.console.log = conditional(original.log)
  window.console.info = conditional(original.info)
  window.console.warn = conditional(original.warn)
  window.console.error = conditional(original.error)
}

// The same typed clients every server component uses, exposed on window so the real app's API is
// one line away in the browser console - window.{{ cookiecutter.project_slug }}.api.me(),
// window.{{ cookiecutter.project_slug }}.auth.session(), etc. - instead of hand-rolling fetch()
// calls to poke at the backend.
export function globalApi(window: WindowLike) {
  const api = createApi(apiOrigin())
  const auth = createAuthApi(authOrigin())
  window.{{ cookiecutter.project_slug }} = {
    api,
    auth,
    debug: (flag: boolean) => {
      logsEnabled = flag
    },
  }
  return window.{{ cookiecutter.project_slug }}
}
