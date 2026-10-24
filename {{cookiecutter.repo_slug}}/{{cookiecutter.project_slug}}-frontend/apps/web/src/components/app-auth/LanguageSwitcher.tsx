'use client'

import { useRouter } from 'next/navigation'

import type React from 'react'

import { i18next } from '@/i18n/client'
import { languages } from '@/i18n/config'
import type { Language } from '@/i18n/config'
import { useLanguage } from '@/lib/LanguageContext'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'

import { anyVersion } from '@isikk/core'
import { useIdempotencyKey } from '@isikk/core/hooks'

// String(), not "?? code": .of() only returns undefined with fallback: "none".
function displayName(code: Language): string {
  return String(new Intl.DisplayNames([code], { type: 'language' }).of(code))
}

export function LanguageSwitcher() {
  const router = useRouter()
  const language = useLanguage()
  // Not crypto.randomUUID(), which a page served over plain http, as in dev, does not have.
  const switching = useIdempotencyKey()

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as Language
    if (next === language) return
    // Any version: this writes the language alone, so there is nothing of anybody else's to overwrite.
    const change = { language: next }
    await createApi(apiOrigin()).updateMe(change, { ...anyVersion(), ...switching.headerFor(change) })
    switching.used()
    // For client components now; server-rendered text follows on refresh().
    await i18next.changeLanguage(next)
    router.refresh()
  }

  // Nothing to switch between with one language.
  if (languages.length < 2) return null

  return (
    <select
      aria-label="Language"
      value={language}
      onChange={handleChange}
      className="h-9 rounded-none border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
    >
      {languages.map((code) => (
        <option key={code} value={code}>
          {displayName(code)}
        </option>
      ))}
    </select>
  )
}
