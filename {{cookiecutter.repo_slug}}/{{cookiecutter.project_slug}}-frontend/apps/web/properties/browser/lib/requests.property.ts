import { apiOrigin } from '@/lib/apiOrigin'
import { authOrigin } from '@/lib/authOrigin'
import { isLocalDevHost } from '@/lib/isLocalDevHost'
import { requestOrigin } from '@/lib/requestOrigin'
import { broadcastSessionCleared, onSessionCleared } from '@/lib/sessionChannel'
import { signInProviders, socialProviders } from '@/lib/socialProviders'
import { TOO_MANY_REQUESTS_PATH, tooManyRequestsPage } from '@/lib/tooManyRequests'
import { tooManyRequestsMessage } from '@/lib/tooManyRequestsMessage'

import { navigation } from '../../support/requests'
import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const config = vi.hoisted(() => ({
  DOMAIN: 'test-project.test',
  SOCIAL_LOGIN: { PROVIDERS: [] as string[], ICONS: [] as string[], ADMIN_ONLY: [] as string[] },
}))
vi.mock('@/config/public', () => ({ CONFIG: config }))

const providerId = fc.stringMatching(/^[a-z]{2,8}(_[a-z]{2,8}){0,2}$/)

describe('the social providers', () => {
  test.prop([fc.uniqueArray(providerId, { maxLength: 4 }), fc.nat(), fc.boolean(), fc.boolean()])(
    'are the configured ids, each named from its own words and given the icon configured for it',
    (ids, pick, issuers, admin) => {
      const withIcon = ids.length ? ids[pick % ids.length] : null
      // Listed as issuers or not: either way it is the id allauth knows that the button carries.
      const entries = ids.map((id) => (issuers ? `openid_connect:${id}` : id))
      const adminOnly = entries.filter((_, index) => index % 2 === 1)
      config.SOCIAL_LOGIN.PROVIDERS = entries.map((entry) => ` ${entry} `).concat([' '])
      config.SOCIAL_LOGIN.ADMIN_ONLY = adminOnly
      config.SOCIAL_LOGIN.ICONS = withIcon ? [` ${withIcon} = /icons/${withIcon}.svg `] : []

      expect(socialProviders()).toEqual(
        ids.map((id) => ({
          id,
          name: id
            .split('_')
            .map((part) => part[0].toUpperCase() + part.slice(1))
            .join(' '),
          icon: id === withIcon ? `/icons/${id}.svg` : '',
          adminOnly: adminOnly.includes(issuers ? `openid_connect:${id}` : id),
        }))
      )
      expect(signInProviders(admin).map((provider) => provider.id)).toEqual(
        ids.filter((_, index) => admin || index % 2 === 0)
      )
    }
  )

  test.prop([fc.constantFrom('no-separator', '=/only-a-url', 'only-an-id=', ' = ')])(
    'refuse an icon entry that is not <id>=<url> rather than showing no icon',
    (entry) => {
      config.SOCIAL_LOGIN.PROVIDERS = []
      config.SOCIAL_LOGIN.ADMIN_ONLY = []
      config.SOCIAL_LOGIN.ICONS = [entry]
      expect(() => socialProviders()).toThrow(/is not <provider id>=<url or path>/)
    }
  )

  test.prop([fc.uniqueArray(providerId, { minLength: 1, maxLength: 3 })])(
    'refuse an admin-only provider that is not offered at all',
    (ids) => {
      config.SOCIAL_LOGIN.PROVIDERS = []
      config.SOCIAL_LOGIN.ICONS = []
      config.SOCIAL_LOGIN.ADMIN_ONLY = ids
      expect(() => socialProviders()).toThrow(/SOCIAL_LOGIN__ADMIN_ONLY names what SOCIAL_LOGIN__PROVIDERS does not/)
    }
  )
})

describe("the deployment's origins", () => {
  test.prop([fc.constantFrom('http', 'https'), fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined })])(
    'answer for the configured domain, at any port, and for no other host',
    (scheme, port) => {
      const host = `test-project.test${port ? `:${port}` : ''}`
      expect(requestOrigin(new Headers({ host, 'x-forwarded-proto': scheme }))).toMatch(
        /\/\/test-project\.test(:\d+)?$/
      )
      expect(requestOrigin(new Headers({ host: 'evil.example' }))).toMatch(/\/\/test-project\.test$/)
    }
  )

  test.prop([fc.domain()])('take a host on .test or .localhost as local development', (domain) => {
    expect(isLocalDevHost(`${domain}.test`)).toBe(true)
    expect(isLocalDevHost(`${domain}.localhost`)).toBe(true)
    expect(isLocalDevHost(`${domain}.com`)).toBe(false)
  })

  test('name the api and auth hosts beside the page', () => {
    expect(apiOrigin()).toBe(window.location.origin.replace('://', '://api.'))
    expect(authOrigin()).toBe(window.location.origin.replace('://', '://auth.'))
  })
})

describe('a session cleared in another tab', () => {
  test.prop([fc.array(fc.constantFrom('session-cleared', 'something-else', 42), { maxLength: 5 })])(
    'is heard only for its own message, and only until the listener is dropped',
    async (messages) => {
      const heard = vi.fn()
      const stop = onSessionCleared(heard)
      // A channel never delivers to its own poster, so the other tab is a second channel on the same name.
      const otherTab = new BroadcastChannel('{{ cookiecutter.project_slug }}-session')
      for (const message of messages) otherTab.postMessage(message)
      await new Promise((resolve) => setTimeout(resolve, 20))
      stop()
      otherTab.postMessage('session-cleared')
      await new Promise((resolve) => setTimeout(resolve, 20))
      otherTab.close()
      expect(heard).toHaveBeenCalledTimes(messages.filter((message) => message === 'session-cleared').length)
      broadcastSessionCleared()
    }
  )
})

describe('a rate-limited server read', () => {
  // 429 drawn as often as everything else together: one value among 400 would almost never be the one drawn.
  test.prop([fc.option(fc.webPath(), { nil: null }), fc.oneof(fc.constant(429), fc.integer({ min: 200, max: 599 }))])(
    'leaves for the waiting page on a 429, remembering where it was, and passes anything else through',
    async (page, status) => {
      navigation.redirect.mockClear()
      const headers = new Headers(page ? { 'x-page-path': page } : {})
      const answer = new Response(null, { status })
      const read = tooManyRequestsPage(headers, async () => answer)
      if (status !== 429) {
        expect(await read('http://api.test-project.test/')).toBe(answer)
        return
      }
      await expect(read('http://api.test-project.test/')).rejects.toThrow()
      expect(navigation.redirect).toHaveBeenCalledWith(
        page ? `${TOO_MANY_REQUESTS_PATH}?next=${encodeURIComponent(page)}` : TOO_MANY_REQUESTS_PATH
      )
    }
  )

  test.prop([fc.option(fc.integer({ min: 1, max: 3600 }), { nil: null })])(
    'says how long to wait when it is told',
    (seconds) => {
      const message = tooManyRequestsMessage(seconds)
      expect(message.length).toBeGreaterThan(0)
      if (seconds) expect(message).toContain(String(seconds))
    }
  )
})
