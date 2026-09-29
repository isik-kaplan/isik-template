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

  // No .filter(Boolean) needed for a stray empty entry (e.g. "en,,fr" or a trailing comma): "" is
  // never itself a supported code, and "".split('-')[0] is "" too, so it falls through the loop
  // below exactly like any other unsupported tag would - filtering it out first changes nothing.
  // Stryker disable next-line StringLiteral: equivalent mutant. A missing header only ever needs
  // to produce something that resolves no supported tag - any other placeholder does that too.
  const requested = (acceptLanguageHeader ?? '').split(',').map((entry) => entry.split(';')[0].trim().toLowerCase())

  for (const tag of requested) {
    // Stryker disable next-line ConditionalExpression: equivalent mutant whenever no configured
    // language is itself hyphenated (e.g. "en", "tr"): tag.split('-')[0] equals tag when tag has
    // no dash, so the base-subtag check below already returns the identical value - this line
    // only earns its keep once "languages" names a compound code too (e.g. "zh-hans", "pt-br" -
    // both real entries in hooks/_validate.py's own KNOWN_LANGUAGES), where an exact "zh-hans"
    // match must not fall through to base "zh" instead.
    if (isSupported(tag)) return tag
    const base = tag.split('-')[0]
    if (base && isSupported(base)) return base
  }

  return 'en'
}
