import { languages } from '@/i18n/config'
import type { Language } from '@/i18n/config'

// Stryker disable next-line BlockStatement: equivalent mutant with only one configured language -
// every caller below is already equivalent-dead regardless of what this returns (see each one's
// own comment), so an empty body changes nothing observable. Real once "languages" names more
// than one.
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
  // Stryker disable next-line ConditionalExpression,BlockStatement: equivalent mutant with only
  // one configured language - isSupported(userLanguage) is only ever true for "en", which is also
  // the only value every fallback path below can ever return, so skipping this branch changes
  // nothing observable. Real once "languages" names more than one.
  if (userLanguage && isSupported(userLanguage)) {
    return userLanguage
  }

  // No .filter(Boolean) needed for a stray empty entry (e.g. "en,,fr" or a trailing comma): "" is
  // never itself a supported code, and "".split('-')[0] is "" too, so it falls through the loop
  // below exactly like any other unsupported tag would - filtering it out first changes nothing.
  // Stryker disable next-line StringLiteral,MethodExpression: equivalent mutant with only one
  // configured language - every possible value this can produce either matches "en" or doesn't,
  // and a non-match falls through to the exact same "en" this function would return anyway, so
  // case-folding, whitespace-trimming and the placeholder itself are all unobservable here. Real
  // once "languages" names more than one (a second language can genuinely fail to match a header
  // that differs only by case or stray whitespace).
  const requested = (acceptLanguageHeader ?? '').split(',').map((entry) => entry.split(';')[0].trim().toLowerCase())

  // Stryker disable next-line BlockStatement: equivalent mutant, same single-language reason as
  // the two checks inside this loop - an empty body still falls through to the identical "en"
  // fallback below.
  for (const tag of requested) {
    // Stryker disable next-line ConditionalExpression: equivalent mutant whenever no configured
    // language is itself hyphenated (e.g. "en", "tr"): tag.split('-')[0] equals tag when tag has
    // no dash, so the base-subtag check below already returns the identical value - this line
    // only earns its keep once "languages" names a compound code too (e.g. "zh-hans", "pt-br" -
    // both real entries in hooks/_validate.py's own KNOWN_LANGUAGES), where an exact "zh-hans"
    // match must not fall through to base "zh" instead.
    if (isSupported(tag)) return tag
    // Stryker disable next-line StringLiteral: equivalent mutant with only one configured
    // language, same reason as `requested` above - whatever this produces either matches "en" or
    // falls through to the same "en" fallback.
    const base = tag.split('-')[0]
    // Stryker disable next-line ConditionalExpression: equivalent mutant with only one configured
    // language - isSupported(base) is only ever true for "en", the same value every fallback path
    // below already returns. Real once "languages" names more than one. With only "en"
    // configured, the only base that can ever reach here is "en" itself, and returning it
    // "proves" nothing a passing fallback test doesn't already prove (see resolveLanguage.test.ts's
    // own top comment) - covered for real by "matches a regional tag by its base subtag" once
    // "languages" names a second, real language.
    /* v8 ignore next */
    if (base && isSupported(base)) return base
  }

  return 'en'
}
