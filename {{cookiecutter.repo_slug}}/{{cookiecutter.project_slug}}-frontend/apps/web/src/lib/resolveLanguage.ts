import { languages } from '@/i18n/config'
import type { Language } from '@/i18n/config'

function isSupported(code: string): code is Language {
  return (languages as readonly string[]).includes(code)
}

// A signed-in user's saved preference wins; then whatever the browser sent, matched exactly or by
// its base subtag (e.g. "en-GB" -> "en"); then the default. No URL segments and no cookie either -
// this runs once per request from the Accept-Language header already on it (see getSession.ts),
// so a user with no preference simply gets re-resolved on every request, same as the header itself.
export function resolveLanguage(
  userLanguage: string | null | undefined,
  acceptLanguageHeader: string | null
): Language {
  if (userLanguage && isSupported(userLanguage)) {
    return userLanguage
  }

  const requested = (acceptLanguageHeader ?? '')
    .split(',')
    .map((entry) => entry.split(';')[0]?.trim().toLowerCase())
    .filter((tag): tag is string => Boolean(tag))

  for (const tag of requested) {
    if (isSupported(tag)) return tag
    const base = tag.split('-')[0]
    if (base && isSupported(base)) return base
  }

  return 'en'
}
