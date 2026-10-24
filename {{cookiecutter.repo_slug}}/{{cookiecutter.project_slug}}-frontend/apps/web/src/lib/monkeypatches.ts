import { createApi, createAuthApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { authOrigin } from '@/lib/authOrigin'

import { createConsoleDebugSwitch } from '@isikk/core'

// The window.{{ cookiecutter.project_slug }} type is declared in global.d.ts.

// `console` is on `typeof globalThis`, not `Window`.
type WindowLike = Window & typeof globalThis

// The typed clients on window, e.g. window.{{ cookiecutter.project_slug }}.api.me() in the console.
export function globalApi(window: WindowLike) {
  const api = createApi(apiOrigin())
  const auth = createAuthApi(authOrigin())
  // The switch adds `debug`, silencing the console until `debug(true)` turns it back on.
  window.{{ cookiecutter.project_slug }} = { api, auth } as Window['{{ cookiecutter.project_slug }}']
  createConsoleDebugSwitch(window, { namespace: '{{ cookiecutter.project_slug }}' })
  return window.{{ cookiecutter.project_slug }}
}
