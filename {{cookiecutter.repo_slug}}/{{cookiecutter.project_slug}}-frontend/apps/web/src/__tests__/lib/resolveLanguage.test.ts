import { languages } from '@/i18n/config'
import type { Language } from '@/i18n/config'
import { resolveLanguage } from '@/lib/resolveLanguage'

import { describe, expect, it } from 'vitest'

// A real match needs a language other than "en", the fallback; with only "en" these are skipped.
// An explicit predicate: with one language TypeScript would infer `code is never`.
const other = languages.find((code): code is Language => code !== 'en')

describe('resolveLanguage', () => {
  it('defaults to English with no user preference and no Accept-Language header', () => {
    expect(resolveLanguage(undefined, null)).toBe('en')
  })

  it('ignores null and empty-string preferences the same as an absent one', () => {
    expect(resolveLanguage(null, null)).toBe('en')
    expect(resolveLanguage('', null)).toBe('en')
  })

  it('ignores a user preference that is not a supported language', () => {
    expect(resolveLanguage('xx', 'en')).toBe('en')
  })

  it('falls back to English for an empty Accept-Language header', () => {
    expect(resolveLanguage(undefined, '')).toBe('en')
  })

  it('falls back to English when nothing in the header is supported', () => {
    expect(resolveLanguage(undefined, 'xx, yy')).toBe('en')
  })

  // `if (!other) return` narrows for TypeScript, which cannot see `it.runIf`'s skip.
  it.runIf(Boolean(other))('uses a supported user preference over the browser header', () => {
    if (!other) return
    expect(resolveLanguage(other, 'xx')).toBe(other)
  })

  it.runIf(Boolean(other))('ignores an unsupported preference and falls through to the header', () => {
    if (!other) return
    expect(resolveLanguage('xx', other)).toBe(other)
  })

  it.runIf(Boolean(other))('matches a supported language named exactly in Accept-Language', () => {
    if (!other) return
    expect(resolveLanguage(undefined, other)).toBe(other)
  })

  it.runIf(Boolean(other))('matches case-insensitively', () => {
    if (!other) return
    expect(resolveLanguage(undefined, other.toUpperCase())).toBe(other)
  })

  it.runIf(Boolean(other))('ignores a q-value suffix on the tag', () => {
    if (!other) return
    expect(resolveLanguage(undefined, `${other};q=0.5`)).toBe(other)
  })

  it.runIf(Boolean(other))('matches a regional tag by its base subtag', () => {
    if (!other) return
    expect(resolveLanguage(undefined, `${other}-XX`)).toBe(other)
  })

  it.runIf(Boolean(other))('does not match a regional tag whose base is unsupported', () => {
    if (!other) return
    expect(resolveLanguage(undefined, 'xx-YY')).toBe('en')
  })

  it.runIf(Boolean(other))('matches a regional tag by its base subtag later in a multi-value header', () => {
    if (!other) return
    expect(resolveLanguage(undefined, `xx-YY, ${other}-XX`)).toBe(other)
  })

  it.runIf(Boolean(other))('picks the first supported tag in a multi-value Accept-Language header', () => {
    if (!other) return
    expect(resolveLanguage(undefined, `xx, yy, ${other}`)).toBe(other)
  })
})
