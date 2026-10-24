import { languages } from '@/i18n/config'
import type { Language } from '@/i18n/config'

function isSupported(code: string): code is Language {
  return (languages as readonly string[]).includes(code)
}

// The saved preference, then Accept-Language (exact or base subtag), then the default.
export function resolveLanguage(
  userLanguage: string | null | undefined,
  acceptLanguageHeader: string | null
): Language {
  if (userLanguage && isSupported(userLanguage)) {
    return userLanguage
  }

  // An empty entry ("en,,fr") falls through like any unsupported tag.
  const requested = (acceptLanguageHeader ?? '').split(',').map((entry) => entry.split(';')[0].trim().toLowerCase())

  for (const tag of requested) {
    if (isSupported(tag)) return tag
    const base = tag.split('-')[0]
    if (base && isSupported(base)) return base
  }

  return 'en'
}
