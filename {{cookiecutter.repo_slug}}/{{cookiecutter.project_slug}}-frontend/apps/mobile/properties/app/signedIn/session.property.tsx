import { getApi } from '@/lib/api'
import i18n, { SUPPORTED_LANGUAGES } from '@/lib/i18n'
import { getAuthApi, signedInFetch } from '@/lib/session'
import { useAuthenticated } from '@/lib/useAuthenticated'

import { forgetNavigation, navigation } from '../../support/navigation'
import { type Drawn, held, json, serve } from '../../support/signedIn/server'
import { kept } from '../../support/store'
import { renderHook, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const token = fc.stringMatching(/^[A-Za-z0-9]{8,32}$/)

// Every way allauth answers the session check: signed in, mid-flow, signed out, or something else entirely.
const answer = fc.oneof(
  fc.record(
    {
      status: fc.constant(200),
      authenticated: fc.constant(true),
      language: fc.constantFrom<string>(...SUPPORTED_LANGUAGES, 'xx', ''),
    },
    { requiredKeys: ['status', 'authenticated'] }
  ),
  fc.record({ status: fc.constant(401), authenticated: fc.option(fc.boolean(), { nil: undefined }) }),
  fc.record({ status: fc.constantFrom(500, 503), authenticated: fc.constant(undefined) })
)
type Answer = Drawn<typeof answer>

function sessionAnswer(drawn: Answer) {
  if (drawn.status === 200) {
    const user = { id: 1, email: 'a@b.cd', ...('language' in drawn ? { language: drawn.language } : {}) }
    return json(200, { status: 200, data: { user, methods: [] }, meta: { is_authenticated: true } })
  }
  if (drawn.status === 401) {
    const meta = drawn.authenticated === undefined ? {} : { meta: { is_authenticated: drawn.authenticated } }
    return json(401, { status: 401, data: { flows: [] }, ...meta })
  }
  return new Response('Service unavailable', { status: drawn.status })
}

describe('the session', () => {
  it('is signed in exactly as the answer says, false when it says nothing, and takes up a supported saved language', async () => {
    await fc.assert(
      fc.asyncProperty(answer, async (drawn) => {
        await i18n.changeLanguage('en')
        const later = held<Response>()
        serve(() => later.promise)
        const { result, unmount } = await renderHook(() => useAuthenticated())
        expect(result.current).toBeNull()
        later.release(sessionAnswer(drawn))
        await waitFor(() => expect(result.current).toBe(drawn.authenticated ?? false))
        const language = 'language' in drawn ? drawn.language : ''
        // A language this app speaks is taken up; anything else leaves English.
        expect(i18n.language).toBe(
          (SUPPORTED_LANGUAGES as readonly (string | undefined)[]).includes(language) ? language : 'en'
        )
        await unmount()
      })
    )
  })

  it('decides nothing once the asker has gone', async () => {
    await fc.assert(
      fc.asyncProperty(answer, async (drawn) => {
        await i18n.changeLanguage('en')
        const later = held<Response>()
        serve(() => later.promise)
        const { result, unmount } = await renderHook(() => useAuthenticated())
        await unmount()
        later.release(sessionAnswer(drawn))
        await new Promise((settle) => setTimeout(settle, 0))
        expect(result.current).toBeNull()
        expect(i18n.language).toBe('en')
      })
    )
  })

  it('keeps a token allauth reissues and sends it on, and drops it at logout', async () => {
    await fc.assert(
      fc.asyncProperty(fc.option(token, { nil: undefined }), token, async (before, reissued) => {
        kept.clear()
        if (before) kept.set('session_token', before)
        const calls = serve(({ method }) =>
          json(method === 'DELETE' ? 401 : 200, { status: 200, data: {}, meta: { session_token: reissued } })
        )
        await getAuthApi().session()
        expect(calls[0].headers.get('X-Session-Token')).toBe(before ?? null)
        expect(kept.get('session_token')).toBe(reissued)
        await getAuthApi().emails()
        expect(calls[1].headers.get('X-Session-Token')).toBe(reissued)
        await getAuthApi().logout()
        expect(kept.has('session_token')).toBe(false)
      })
    )
  })

  it('sends the app to prove it is them whenever either API asks, and hands the answer on untouched', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('allauth', 'own API', 'plain fetch'),
        fc.boolean(),
        fc.constantFrom(200, 401, 403),
        fc.option(token, { nil: undefined }),
        async (via, asks, status, stored) => {
          forgetNavigation()
          kept.clear()
          if (stored) kept.set('session_token', stored)
          const headers: Record<string, string> = asks ? { 'X-Reauthentication-Required': '1' } : {}
          const calls = serve(() => json(status, { status }, headers))
          let answered: Response | undefined
          if (via === 'allauth') answered = (await getAuthApi().addEmail('a@b.cd')).response
          if (via === 'own API') answered = (await getApi().notifications()).response
          if (via === 'plain fetch') answered = await signedInFetch('http://api.test-project.test/v0/users/me/')
          expect(answered?.status).toBe(status)
          expect(navigation.push.mock.calls).toEqual(asks ? [['/prove']] : [])
          expect(calls[0].headers.get('X-Session-Token')).toBe(stored ?? null)
        }
      )
    )
  })
})
