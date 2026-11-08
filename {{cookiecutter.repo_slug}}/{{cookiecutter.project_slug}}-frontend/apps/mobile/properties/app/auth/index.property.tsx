import RootLayout from '@/app/_layout'
import Index from '@/app/index'
import i18n, { SUPPORTED_LANGUAGES } from '@/lib/i18n'

import { allauth, json, latch } from '../../support/auth/allauth'
import { forgetNavigation } from '../../support/navigation'
import { kept } from '../../support/store'
import { render, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

// A 401 with a flow pending can still be signed in; only `meta` says.
const SESSIONS = [
  { answer: 'signed in', status: 200, meta: { is_authenticated: true }, home: true },
  { answer: 'signed in, a flow pending', status: 401, meta: { is_authenticated: true }, home: true },
  { answer: 'signed out', status: 401, meta: { is_authenticated: false }, home: false },
  { answer: 'no meta at all', status: 410, meta: undefined, home: false },
]

describe('the first screen', () => {
  it('waits on the session, then sends a signed-in visitor home and anyone else to login', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SESSIONS),
        fc.option(fc.constant('en'), { nil: undefined }),
        async (session, language) => {
          forgetNavigation()
          kept.clear()
          const gate = latch()
          allauth(async () => {
            await gate.shut
            return json(session.status, {
              status: session.status,
              data: { user: { id: 1, language } },
              meta: session.meta,
            })
          })
          const view = await render(<Index />)
          expect(view.getByTestId('loading-indicator')).toBeTruthy()
          gate.open()
          const where = session.home ? '/(authenticated)/home' : '/login'
          await waitFor(() => expect(view.getByTestId('redirect').props.accessibilityHint).toBe(where))
          await view.unmount()
        }
      )
    )
  })
})

describe('the root layout', () => {
  it('lays every route out in one stack, in whichever language the app speaks', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...SUPPORTED_LANGUAGES), async (language) => {
        await i18n.changeLanguage(language)
        const view = await render(<RootLayout />)
        expect(view.getAllByTestId('stack')).toHaveLength(1)
        await view.unmount()
      })
    )
  })
})
