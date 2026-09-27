import { resolveLanguage } from '@/lib/resolveLanguage'

import { describe, expect, it } from 'vitest'

describe('resolveLanguage', () => {
  it('defaults to English with no user preference and no Accept-Language header', () => {
    expect(resolveLanguage(undefined, null)).toBe('en')
  })

  it('uses a supported user preference over the browser header', () => {
    expect(resolveLanguage('en', 'de')).toBe('en')
  })

  it('ignores a user preference that is not a supported language', () => {
    expect(resolveLanguage('xx', 'en')).toBe('en')
  })

  it('ignores null and empty-string preferences the same as an absent one', () => {
    expect(resolveLanguage(null, null)).toBe('en')
    expect(resolveLanguage('', null)).toBe('en')
  })

  it('matches a supported language named exactly in Accept-Language', () => {
    expect(resolveLanguage(undefined, 'en')).toBe('en')
  })

  it('matches a regional tag by its base subtag', () => {
    expect(resolveLanguage(undefined, 'en-GB')).toBe('en')
  })

  it('picks the first supported tag in a multi-value Accept-Language header', () => {
    expect(resolveLanguage(undefined, 'de, fr;q=0.9, en;q=0.8')).toBe('en')
  })

  it('falls back to English when nothing in the header is supported', () => {
    expect(resolveLanguage(undefined, 'de, fr')).toBe('en')
  })

  it('falls back to English for an empty Accept-Language header', () => {
    expect(resolveLanguage(undefined, '')).toBe('en')
  })
})
