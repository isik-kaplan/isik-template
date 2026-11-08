import type { Translate } from '@/i18n/config'
import { languages } from '@/i18n/config'
import { OAUTH_AUTHORIZE_PATH, afterSignIn } from '@/lib/afterSignIn'
import { formatUserAgent } from '@/lib/formatUserAgent'
import { changedFields, historyActionLabels, historyFieldLabels } from '@/lib/historyLabels'
import { personLabel } from '@/lib/names'
import { describedScopes, scopeLabel } from '@/lib/oauthScopes'
import { fieldsOf, parseQuery, queryFrom } from '@/lib/queryGrammar'
import { QUERY_GRAMMAR } from '@/lib/queryGrammar.generated'
import { redirectUrisFrom } from '@/lib/redirectUris'
import { resolveLanguage } from '@/lib/resolveLanguage'
import { STORAGE_ITEMS, storageKindLabels, storagePurposeLabels } from '@/lib/storageDisclosure'
import { cn, getInitials } from '@/lib/utils'

import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect } from 'vitest'

// Answers each key with itself, so a property reads which label was chosen.
const t = ((key: string) => key) as unknown as Translate

const word = fc.stringMatching(/^[^\s:]{1,12}$/)

describe('the query grammar', () => {
  const resources = Object.keys(QUERY_GRAMMAR)

  test('has resources to parse for at all', () => {
    expect(resources.length).toBeGreaterThan(0)
  })

  test.prop([fc.constantFrom(...resources), fc.constantFrom('', ' ', '\t ')])(
    'reads nothing typed as no query at all',
    (resource, blank) => {
      expect(parseQuery(resource, blank)).toEqual({ terms: '', chips: [] })
    }
  )

  test.prop([fc.constantFrom(...resources), fc.array(word, { maxLength: 4 }), fc.nat()])(
    'reads back every declared chip and every bare term that went into a query',
    (resource, terms, pick) => {
      const fields = Object.keys(fieldsOf(resource))
      const chips = fields.length ? [{ field: fields[pick % fields.length], value: `v${pick}` }] : []
      const input = [...chips.map((chip) => `${chip.field}:${chip.value}`), ...terms].join(' ')

      const parsed = parseQuery(resource, input)

      expect(parsed.problem).toBeUndefined()
      expect(parsed.chips).toEqual(chips)
      expect(parsed.terms).toBe(terms.join(' '))
      expect(queryFrom(parsed)).toEqual({
        ...Object.fromEntries(chips.map((chip) => [chip.field, chip.value])),
        ...(terms.length ? { search: terms.join(' ') } : {}),
      })
    }
  )

  test.prop([fc.constantFrom(...resources), fc.stringMatching(/^[a-z_]{3,10}$/)])(
    'refuses a field the endpoint never declared rather than sending a filter that does nothing',
    (resource, field) => {
      fc.pre(!Object.hasOwn(fieldsOf(resource), field))
      expect(parseQuery(resource, `${field}:x`)).toEqual({
        terms: '',
        chips: [],
        problem: { field, declared: Object.keys(fieldsOf(resource)) },
      })
    }
  )

  test.prop([fc.webUrl()])('takes an address as a term, not an unknown field', (url) => {
    fc.pre(!/\s/.test(url))
    expect(parseQuery('no-such-resource', url)).toEqual({ terms: url, chips: [] })
    expect(fieldsOf('no-such-resource')).toEqual({})
  })
})

describe('a user agent', () => {
  test.prop([fc.string()])('keeps the string it was given, trimmed', (agent) => {
    expect(formatUserAgent(agent).raw).toBe(agent.trim())
  })

  const BROWSERS = [
    ['Edg/120', 'Edge'],
    ['OPR/100', 'Opera'],
    ['Chrome/120', 'Chrome'],
    ['CriOS/120', 'Chrome'],
    ['Firefox/120', 'Firefox'],
    ['FxiOS/120', 'Firefox'],
    ['Safari/605', 'Safari'],
    ['curl/8', 'curl'],
  ] as const
  const PLATFORMS = [
    ['Windows NT 10.0', 'Windows'],
    ['iPhone', 'iOS'],
    ['Android 14', 'Android'],
    ['CrOS x86', 'ChromeOS'],
    ['Mac OS X 14', 'macOS'],
    ['Linux x86_64', 'Linux'],
  ] as const

  test('is named for its browser on its platform, for every pair the tables hold', () => {
    for (const [browserToken, browser] of BROWSERS) {
      for (const [platformToken, platform] of PLATFORMS) {
        expect(formatUserAgent(`Mozilla/5.0 (${platformToken}) ${browserToken}`).name).toBe(`${browser} on ${platform}`)
      }
      expect(formatUserAgent(browserToken).name).toBe(browser)
    }
    for (const [platformToken, platform] of PLATFORMS) expect(formatUserAgent(platformToken).name).toBe(platform)
  })

  test.prop([fc.stringMatching(/^[a-z]{1,80}$/)])(
    'is shown as itself, cut to fit a row, when nothing is recognized',
    (agent) => {
      fc.pre(!/curl|linux|android|safari|firefox|chrome|opera|edg|windows|iphone|ipad|ipod/i.test(agent))
      expect(formatUserAgent(agent).name).toBe(agent.length > 40 ? `${agent.slice(0, 40)}…` : agent)
    }
  )

  test.prop([fc.integer({ min: 41, max: 120 })])('is cut to fit a row when it is long and unrecognized', (length) => {
    const agent = 'x'.repeat(length)
    expect(formatUserAgent(agent).name).toBe(`${'x'.repeat(40)}…`)
  })

  test.prop([fc.stringMatching(/^\s*$/)])('has no name when it is blank', (agent) => {
    expect(formatUserAgent(agent)).toEqual({ name: null, raw: '' })
  })
})

describe('a scope', () => {
  test.prop([fc.stringMatching(/^[a-z_.]{1,20}$/), fc.string()])(
    'is said in words where it is known, and shown as itself where it is not',
    (scope, label) => {
      fc.pre(!['openid', 'profile', 'email'].includes(scope))
      expect(scopeLabel(scope, t, describedScopes([{ name: scope, label }]))).toBe(label)
      expect(scopeLabel(scope, t)).toBe(scope)
      expect(scopeLabel(scope, t, describedScopes(undefined))).toBe(scope)
    }
  )

  test('names the sign-in scopes itself', () => {
    expect(['openid', 'profile', 'email'].map((scope) => scopeLabel(scope, t))).toEqual([
      'auth:oauthScopeOpenid',
      'auth:oauthScopeProfile',
      'auth:oauthScopeEmail',
    ])
  })
})

describe('redirect addresses typed one a line', () => {
  test.prop([fc.array(fc.webUrl(), { maxLength: 4 }), fc.array(fc.stringMatching(/^[ \t]*$/), { maxLength: 3 })])(
    'are each address, trimmed, with the blank lines gone',
    (uris, blanks) => {
      const typed = [...uris.map((uri) => `  ${uri} `), ...blanks].join('\n')
      expect(redirectUrisFrom(typed)).toEqual(uris)
    }
  )
})

describe('initials', () => {
  test.prop([
    fc.stringMatching(/^[a-z]{1,10}$/),
    fc.stringMatching(/^[a-z]{1,10}$/),
    fc.constantFrom(' ', '-', '_', '.'),
  ])('are the first letters of the first and last parts', (first, last, separator) => {
    expect(getInitials(`${first}${separator}${last}`)).toBe((first[0] + last[0]).toUpperCase())
  })

  test.prop([fc.stringMatching(/^[a-z]{1,10}$/)])('are the first two letters of one word', (only) => {
    expect(getInitials(` ${only} `)).toBe(only.slice(0, 2).toUpperCase())
  })

  test.prop([fc.stringMatching(/^[\s\-_.]*$/)])('are nothing for a name of separators', (name) => {
    expect(getInitials(name)).toBe('')
  })

  test.prop([fc.constantFrom('p-2', 'p-4', 'px-1'), fc.constantFrom('p-3', 'p-6')])('let a later class win', (a, b) => {
    expect(cn(a, b).split(' ')).toContain(b)
    expect(cn(false && a, b)).toBe(b)
  })
})

describe('the language', () => {
  const supported = fc.constantFrom(...languages)

  test.prop([supported, fc.option(fc.string(), { nil: null })])(
    'is the one somebody saved, whatever the browser asks',
    (saved, header) => {
      expect(resolveLanguage(saved, header)).toBe(saved)
    }
  )

  test.prop([supported, fc.stringMatching(/^[A-Z]{2}$/), fc.double({ min: 0, max: 1, noNaN: true })])(
    "is the browser's, by its whole tag or its base, when nothing is saved",
    (language, region, quality) => {
      expect(resolveLanguage(null, `xx-YY,${language}-${region};q=${quality}`)).toBe(language)
      expect(resolveLanguage('zz', `${language.toUpperCase()}`)).toBe(language)
    }
  )

  test.prop([fc.option(fc.stringMatching(/^[a-z]{3,6}(,[a-z]{3,6})*$/), { nil: null })])(
    'falls back to English for nothing it supports',
    (header) => {
      expect(resolveLanguage(undefined, header)).toBe('en')
    }
  )
})

describe('the account history', () => {
  test.prop([fc.dictionary(fc.stringMatching(/^[a-z_]{1,12}$/), fc.jsonValue())])(
    'names each changed field, by its label where it has one, and never the bookkeeping',
    (changes) => {
      const labels = historyFieldLabels(t)
      const named = changedFields(changes, labels)
      const told = Object.keys(changes).filter((field) => field !== 'updated_at')
      expect(named).toEqual(told.map((field) => (Object.hasOwn(labels, field) ? labels[field] : field)))
    }
  )

  test.prop([
    fc.subarray(
      [
        'username',
        'email',
        'first_name',
        'last_name',
        'language',
        'password',
        'last_login',
        'is_active',
        'is_staff',
        'is_superuser',
      ],
      { minLength: 1 }
    ),
  ])('names every field it knows by its label', (known) => {
    const labels = historyFieldLabels(t)
    expect(changedFields(Object.fromEntries(known.map((field) => [field, 1])), labels)).toEqual(
      known.map((field) => labels[field])
    )
  })

  test('keeps a field named like an Object member, and reads no changes as none', () => {
    expect(changedFields({ constructor: 1, toString: 2 }, historyFieldLabels(t))).toEqual(['constructor', 'toString'])
    expect(changedFields(null, {})).toEqual([])
    expect(Object.values(historyActionLabels(t))).toEqual([
      'auth:profileHistoryActionInsert',
      'auth:profileHistoryActionUpdate',
      'auth:profileHistoryActionDelete',
    ])
  })
})

describe('the storage disclosure', () => {
  test('labels every item it lists, by kind and by purpose', () => {
    const kinds = storageKindLabels(t)
    const purposes = storagePurposeLabels(t)
    expect(STORAGE_ITEMS.length).toBeGreaterThan(0)
    for (const item of STORAGE_ITEMS) {
      expect(kinds[item.kind]).toMatch(/^legal:storageKind/)
      expect(purposes[item.purpose]).toMatch(/^legal:storagePurpose/)
    }
  })
})

describe('where signing in returns to', () => {
  test.prop([fc.webPath()])('is a path on this site', (path) => {
    fc.pre(path.startsWith('/') && !path.startsWith('//'))
    expect(afterSignIn(path)).toBe(path)
  })

  test.prop([fc.webUrl()])('is home for anywhere else', (url) => {
    fc.pre(!url.includes('test-project.test'))
    expect(afterSignIn(url)).toBe('/')
  })

  test.prop([fc.webQueryParameters()])("is the backend's own pending authorize request", (query) => {
    const pending = `http://auth.test-project.test${OAUTH_AUTHORIZE_PATH}?${query}`
    // The address as a URL spells it: a quote in the query comes back percent-encoded.
    expect(afterSignIn(pending)).toBe(new URL(pending).href)
    expect(afterSignIn(`http://auth.test-project.test/elsewhere/?${query}`)).toBe('/')
  })
})

describe("a person's label", () => {
  const part = fc.option(fc.oneof(fc.constant(''), fc.stringMatching(/^[A-Z][a-z]{1,8}$/)), { nil: undefined })
  test.prop([
    part,
    part,
    fc.option(fc.oneof(fc.constant(''), fc.stringMatching(/^[a-z]{2,8}$/)), { nil: null }),
    fc.emailAddress(),
  ])('is their name, else their handle, else their address', (first, last, username, email) => {
    const name = `${first ?? ''} ${last ?? ''}`.trim()
    expect(personLabel({ first_name: first, last_name: last, username, email })).toBe(name || username || email)
  })
})
