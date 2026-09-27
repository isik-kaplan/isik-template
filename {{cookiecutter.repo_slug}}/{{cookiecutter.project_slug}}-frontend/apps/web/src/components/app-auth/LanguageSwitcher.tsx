'use client'

import { useRouter } from 'next/navigation'

import type React from 'react'

import { i18next } from '@/i18n/client'
import { languages } from '@/i18n/config'
import type { Language } from '@/i18n/config'
import { useLanguage } from '@/lib/LanguageContext'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'

// Intl.DisplayNames, not a hand-written {en: "English", tr: "Turkish", ...} map - one more
// language added to cookiecutter's "languages" needs no matching entry added here too.
// String(), not "?? code": .of()'s own type is string | undefined, but it only actually returns
// undefined with fallback: "none" - the default ("code") always returns a string for any
// well-formed tag, which every entry in `languages` is.
function displayName(code: Language): string {
  return String(new Intl.DisplayNames([code], { type: 'language' }).of(code))
}

export function LanguageSwitcher() {
  const router = useRouter()
  const language = useLanguage()

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as Language
    if (next === language) return
    await createApi(apiOrigin()).updateMe({ language: next })
    // Instant feedback for this render's own client components; the server-rendered text
    // (everything using sUseTranslation) only picks up the change once refresh() re-runs it.
    await i18next.changeLanguage(next)
    router.refresh()
  }

  // Nothing to switch between with only one language configured - matches ThemeToggle's own
  // scope (it always has two, so this guard has no equivalent there).
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
