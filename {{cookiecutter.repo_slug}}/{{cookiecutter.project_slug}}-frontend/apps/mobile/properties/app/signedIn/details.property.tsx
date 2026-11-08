import ProfileDetails from '@/app/(authenticated)/profile/details'
import ProfileMenu from '@/app/(authenticated)/profile/index'
import { PHONE } from '@/lib/phoneOption'

import { forgetNavigation, navigation } from '../../support/navigation'
import { email, held, json, ok, serve } from '../../support/signedIn/server'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

// username and language are optional in the session's user; an empty language is no choice either.
const user = fc.record(
  {
    email,
    username: fc.oneof(fc.constant(''), fc.stringMatching(/^[a-z][a-z0-9_]{1,11}$/)),
    language: fc.constantFrom('', 'en', 'tr'),
  },
  { requiredKeys: ['email'] }
)

// The phone page only where accounts have numbers.
const LINKS = ['details', 'emails', ...(PHONE === 'none' ? [] : ['phone']), 'password', 'connections', 'sessions']

describe('the account details screen', () => {
  it("shows the account's email, its username only when it has one, and its language or the device's", async () => {
    await fc.assert(
      fc.asyncProperty(user, fc.boolean(), async (account, answered) => {
        serve(() => (answered ? ok({ user: account }) : json(401, { status: 401, meta: {} })))
        const view = await render(<ProfileDetails />)
        const shownUser = answered ? account : undefined
        await waitFor(() => expect(screen.getByTestId('profile-details-email').props.children).toBe(shownUser?.email))
        expect(screen.queryByTestId('profile-details-username')?.props.children).toBe(shownUser?.username || undefined)
        expect(screen.getByTestId('profile-details-language').props.children).toBe(
          shownUser?.language || 'Device default'
        )
        await view.unmount()
      })
    )
  })

  it('shows nothing it hears after the screen has gone', async () => {
    await fc.assert(
      fc.asyncProperty(user, async (account) => {
        const answer = held<Response>()
        serve(() => answer.promise)
        const view = await render(<ProfileDetails />)
        await view.unmount()
        answer.release(ok({ user: account }))
        await new Promise((settle) => setTimeout(settle, 0))
        expect(screen.queryByTestId('profile-details-email')).toBeNull()
      })
    )
  })
})

describe('the profile menu', () => {
  it('opens exactly the page of each link pressed, in the order pressed', async () => {
    await fc.assert(
      fc.asyncProperty(fc.shuffledSubarray(LINKS, { minLength: 1 }), async (pages) => {
        forgetNavigation()
        const view = await render(<ProfileMenu />)
        for (const page of pages) await fireEvent.press(screen.getByTestId(`profile-${page}-link`))
        expect(navigation.push.mock.calls).toEqual(pages.map((page) => [`/profile/${page}`]))
        await view.unmount()
      })
    )
  })
})
