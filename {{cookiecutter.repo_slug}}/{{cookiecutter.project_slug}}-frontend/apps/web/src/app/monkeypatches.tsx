'use client'

import { useEffect } from 'react'

import { globalApi } from '@/lib/monkeypatches'

export default function MonkeyPatches() {
  useEffect(() => {
    const {{ cookiecutter.project_slug }} = globalApi(window)
    // Primes the CSRF cookie at load, so the console client is ready before its first call.
    void {{ cookiecutter.project_slug }}.auth.session()
  }, [])

  return null
}
