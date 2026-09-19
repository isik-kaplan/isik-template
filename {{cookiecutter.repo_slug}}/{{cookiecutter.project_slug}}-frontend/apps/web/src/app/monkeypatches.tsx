'use client'

import { useEffect } from 'react'

import { globalApi, noDirectConsoleLog } from '@/lib/monkeypatches'

export default function MonkeyPatches() {
  useEffect(
    () => {
      noDirectConsoleLog(window)
      const {{ cookiecutter.project_slug }} = globalApi(window)
      // Primes the CSRF token/session cookie on initial page load, the same round trip every
      // AuthApi call makes lazily on its own first request - doing it here just means the console
      // client is ready to use immediately instead of on its first real call.
      void {{ cookiecutter.project_slug }}.auth.session()
    },
    // Stryker disable next-line ArrayDeclaration: equivalent mutant. React compares deps by
    // value (Object.is), so a fabricated string literal here is exactly as stable across
    // renders as the empty array - this effect still only runs once either way.
    []
  )

  return null
}
