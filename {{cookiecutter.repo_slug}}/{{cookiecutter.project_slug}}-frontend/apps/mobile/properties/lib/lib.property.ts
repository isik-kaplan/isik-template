import { apiOrigin, authOrigin, webOrigin } from '@/lib/config'
import { installCrypto } from '@/lib/crypto'
import { LEGAL_SLUGS, legalUrl } from '@/lib/legalDocuments'
import type { NameRequirement } from '@/lib/nameRequirement'
import { type NameField, handleLogsIn, offeredNames, offeredValues } from '@/lib/names'
import { phoneOf } from '@/lib/phone'
import { UNREACHABLE_STATUS, answered } from '@/lib/session'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'

import fc from 'fast-check'
import type { TFunction } from 'i18next'

const t = ((key: string, values?: { count?: number }) =>
  values ? `${key}:${values.count}` : key) as unknown as TFunction
const REQUIREMENTS: NameRequirement[] = [
  'username_with_optional_full',
  'full_only',
  'full_and_username',
  'full_with_optional_username',
  'username_only',
]

describe('a refusal for asking too often', () => {
  it('is said only of a 429, with the wait when the answer gives one', () => {
    fc.assert(
      // 429 drawn as often as everything else together: one status among 400 would seldom be the one.
      fc.property(
        fc.oneof(fc.constant(429), fc.integer({ min: 200, max: 599 })),
        fc.oneof(fc.constant(undefined), fc.integer({ min: 1, max: 3600 })),
        (status, wait) => {
          const headers = wait === undefined ? undefined : { 'Retry-After': String(wait) }
          const said = tooManyRequestsMessage(t, new Response(null, { status, headers }))
          if (status !== 429) expect(said).toBeUndefined()
          else expect(said).toBe(wait === undefined ? 'tooManyRequests' : `tooManyRequestsFor:${wait}`)
        }
      )
    )
    expect(tooManyRequestsMessage(t, undefined)).toBeUndefined()
  })
})

describe("a project's names", () => {
  const value = fc.stringMatching(/^[A-Za-z]{0,8}$/)
  it('are offered as the requirement says, and only those are sent', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIREMENTS),
        fc.record({ first_name: value, last_name: value, username: value }),
        (requirement, values) => {
          const offered = offeredNames(requirement)
          expect(offered.includes('username')).toBe(requirement !== 'full_only')
          expect(offered.includes('first_name')).toBe(requirement !== 'username_only')
          expect(handleLogsIn(requirement)).toBe(
            ['full_and_username', 'username_with_optional_full', 'username_only'].includes(requirement)
          )
          expect(offeredValues(values, requirement)).toEqual(
            Object.fromEntries(offered.map((name: NameField) => [name, values[name]]))
          )
        }
      )
    )
    // The project's own requirement when none is named.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(offeredNames()).toEqual(offeredNames(require('@/lib/nameRequirement').nameRequirement()))
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(handleLogsIn()).toBe(handleLogsIn(require('@/lib/nameRequirement').nameRequirement()))
    expect(offeredValues({ first_name: 'a', last_name: 'b', username: 'c' })).toBeTruthy()
  })

  it('takes a build that names a requirement, and refuses one that names anything else', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NAME_REQUIREMENTS, nameRequirement } = require('@/lib/nameRequirement')
    const saved = process.env.EXPO_PUBLIC_NAME_REQUIREMENT
    try {
      fc.assert(
        fc.property(fc.oneof(fc.constantFrom<string>(...NAME_REQUIREMENTS), fc.string()), (value) => {
          process.env.EXPO_PUBLIC_NAME_REQUIREMENT = value
          if (NAME_REQUIREMENTS.includes(value)) expect(nameRequirement()).toBe(value)
          else expect(() => nameRequirement()).toThrow(`EXPO_PUBLIC_NAME_REQUIREMENT is ${JSON.stringify(value)}`)
        })
      )
    } finally {
      if (saved === undefined) delete process.env.EXPO_PUBLIC_NAME_REQUIREMENT
      else process.env.EXPO_PUBLIC_NAME_REQUIREMENT = saved
    }
  })
})

describe('a phone number in a form', () => {
  it('is sent only when one was typed', () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(''), fc.stringMatching(/^\+[1-9][0-9]{7,13}$/)), (phone) => {
        expect(phoneOf(phone)).toEqual(phone ? { phone } : {})
      })
    )
  })
})

describe('the origins', () => {
  it('are read from the environment, the web one being the auth one without its subdomain, and missing ones say so', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{2,10}\.(test|com)$/), fc.boolean(), (domain, set) => {
        const saved = { auth: process.env.EXPO_PUBLIC_AUTH_ORIGIN, api: process.env.EXPO_PUBLIC_API_ORIGIN }
        try {
          if (set) {
            process.env.EXPO_PUBLIC_AUTH_ORIGIN = `https://auth.${domain}`
            process.env.EXPO_PUBLIC_API_ORIGIN = `https://api.${domain}`
            expect(webOrigin()).toBe(`https://${domain}`)
            expect(apiOrigin()).toBe(`https://api.${domain}`)
            for (const slug of LEGAL_SLUGS) expect(legalUrl(slug)).toBe(`https://${domain}/legal/${slug}`)
          } else {
            delete process.env.EXPO_PUBLIC_AUTH_ORIGIN
            delete process.env.EXPO_PUBLIC_API_ORIGIN
            expect(() => authOrigin()).toThrow('EXPO_PUBLIC_AUTH_ORIGIN is not set')
            expect(() => apiOrigin()).toThrow('EXPO_PUBLIC_API_ORIGIN is not set')
          }
        } finally {
          process.env.EXPO_PUBLIC_AUTH_ORIGIN = saved.auth
          process.env.EXPO_PUBLIC_API_ORIGIN = saved.api
        }
      })
    )
  })
})

describe('the language', () => {
  function loadWith(locales: { languageCode: string | null }[]) {
    jest.resetModules()
    jest.doMock('expo-localization', () => ({ getLocales: () => locales }))
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/lib/i18n') as typeof import('@/lib/i18n')
  }

  it("starts as the device's first language this app speaks, else English, and changes only to one it speaks", () => {
    const { SUPPORTED_LANGUAGES } = loadWith([])
    const code = fc.oneof(fc.constantFrom(...SUPPORTED_LANGUAGES), fc.constantFrom('xx', 'zz'), fc.constant(null))
    fc.assert(
      fc.property(
        fc.array(
          code.map((languageCode) => ({ languageCode })),
          { maxLength: 3 }
        ),
        fc.oneof(fc.constantFrom(...SUPPORTED_LANGUAGES), fc.constant('xx')),
        (locales, next) => {
          const { default: i18n, setLanguage } = loadWith(locales)
          const spoken = locales.find(
            ({ languageCode }) => languageCode && (SUPPORTED_LANGUAGES as readonly string[]).includes(languageCode)
          )
          expect(i18n.language).toBe(spoken?.languageCode ?? 'en')
          const before = i18n.language
          setLanguage(next)
          expect(i18n.language).toBe((SUPPORTED_LANGUAGES as readonly string[]).includes(next) ? next : before)
        }
      )
    )
    // Back to a language it speaks from one it does not, as after a signed-in user's choice was dropped.
    const { default: i18n, setLanguage } = loadWith([])
    void i18n.changeLanguage('xx')
    setLanguage(SUPPORTED_LANGUAGES[0])
    expect(i18n.language).toBe(SUPPORTED_LANGUAGES[0])
    jest.dontMock('expo-localization')
  })
})

describe('a runtime without Web Crypto', () => {
  it("gets expo-crypto's, and one with its own keeps it", () => {
    fc.assert(
      fc.property(fc.boolean(), (hasOwn) => {
        const own = { randomUUID: () => 'own' }
        const runtime: { crypto?: unknown } = hasOwn ? { crypto: own } : {}
        installCrypto(runtime)
        if (hasOwn) expect(runtime.crypto).toBe(own)
        else expect(Object.keys(runtime.crypto as object).sort()).toEqual(['getRandomValues', 'randomUUID'])
      })
    )
  })
})

describe('a request', () => {
  // One property per outcome, so each is reached every run.
  it('that arrives is passed on as it came', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 200, max: 599 }), async (status) => {
        const arrived = new Response(null, { status: status === 204 ? 204 : status })
        expect(await answered(async () => arrived)).toBe(arrived)
      })
    )
  })

  it('that never reaches the server is a 503, and an abort still throws', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('TypeError', 'Error', 'AbortError'), fc.string(), async (name, message) => {
        const failure = Object.assign(new Error(message), { name })
        const request = () => answered(async () => Promise.reject(failure))
        if (name === 'AbortError') await expect(request()).rejects.toBe(failure)
        else expect((await request()).status).toBe(UNREACHABLE_STATUS)
      })
    )
  })
})
