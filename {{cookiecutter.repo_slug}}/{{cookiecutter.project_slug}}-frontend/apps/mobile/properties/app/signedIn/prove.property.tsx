import Prove from '@/app/(authenticated)/prove'

import { forgetNavigation, navigation } from '../../support/navigation'
import {
  REFUSED,
  type Refused,
  email,
  held,
  json,
  ok,
  refusal,
  refusalDetails,
  said,
  serve,
} from '../../support/signedIn/server'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

// allauth leaves has_usable_password out of some answers; only an explicit false means none.
const account = fc.record({ email, has_usable_password: fc.boolean() }, { requiredKeys: ['email'] })

describe('the prove-it-is-you screen', () => {
  it('goes back to whatever asked only once the password proves it, and otherwise says why', async () => {
    await fc.assert(
      fc.asyncProperty(
        account.filter((user) => user.has_usable_password !== false),
        fc.boolean(),
        fc.string({ minLength: 1, maxLength: 24 }),
        fc.constantFrom<'proved' | Refused>('proved', ...REFUSED),
        refusalDetails,
        async (user, known, password, outcome, details) => {
          forgetNavigation()
          const calls = serve(({ method }) => {
            if (method === 'GET') return known ? ok({ user }) : json(401, { status: 401, meta: {} })
            return outcome === 'proved' ? ok({}) : refusal(outcome, details)
          })
          const view = await render(<Prove />)
          await waitFor(() => expect(screen.getByTestId('prove-form')).toBeTruthy())
          await fireEvent.changeText(screen.getByTestId('prove-password-input'), password)
          await fireEvent.press(screen.getByTestId('prove-submit'))
          await waitFor(() => expect(screen.getByTestId('prove-submit-label').props.children).toBe('Confirm'))
          expect(calls[1]).toMatchObject({ method: 'POST', path: '/v0/app/auth/reauthenticate', body: { password } })
          if (outcome === 'proved') {
            expect(navigation.back).toHaveBeenCalledTimes(1)
            expect(screen.queryByTestId('prove-error')).toBeNull()
          } else {
            expect(navigation.back).not.toHaveBeenCalled()
            expect(screen.getByTestId('prove-error').props.children).toBe(said(outcome, details, 'proveError'))
          }
          await view.unmount()
        }
      )
    )
  })

  it('offers a passwordless account a link to set one, and says where it went whatever the server answers', async () => {
    await fc.assert(
      fc.asyncProperty(email, fc.constantFrom(200, 400, 429), async (address, status) => {
        const calls = serve(({ method }) => {
          if (method === 'GET') return ok({ user: { email: address, has_usable_password: false } })
          return json(status, { status })
        })
        const view = await render(<Prove />)
        await waitFor(() => expect(screen.getByTestId('prove-set-password-hint')).toBeTruthy())
        await fireEvent.press(screen.getByTestId('prove-set-password-submit'))
        await waitFor(() => expect(screen.getByTestId('prove-set-password-sent')).toBeTruthy())
        expect(screen.getByTestId('prove-set-password-sent').props.children).toContain(address)
        expect(calls[1]).toMatchObject({
          method: 'POST',
          path: '/v0/app/auth/password/request',
          body: { email: address },
        })
        await view.unmount()
      })
    )
  })

  // One property per answer, so each is met in every run: a refused send never reaches the code.
  it.each<['sent', 'proved' | Refused] | [Refused, 'proved']>([
    ...REFUSED.map((refused) => [refused, 'proved'] as [Refused, 'proved']),
    ...(['proved', ...REFUSED] as const).map((outcome) => ['sent', outcome] as ['sent', 'proved' | Refused]),
  ])(
    'without passwords, sends a code to the address and goes back once it proves it, otherwise says why: %s, %s',
    async (sending, proving) => {
      process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY = 'true'
      try {
        await fc.assert(
          fc.asyncProperty(
            email,
            fc.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
            refusalDetails,
            async (address, code, details) => {
              forgetNavigation()
              const calls = serve(({ method, path }) => {
                if (method === 'GET') return ok({ user: { email: address, has_usable_password: false } })
                if (path.endsWith('/code/request')) return sending === 'sent' ? ok({}) : refusal(sending, details)
                return proving === 'proved' ? ok({}) : refusal(proving, details)
              })
              const view = await render(<Prove />)
              await waitFor(() => expect(screen.getByTestId('prove-code-send')).toBeTruthy())
              await fireEvent.press(screen.getByTestId('prove-code-send'))
              expect(calls[1]).toMatchObject({
                method: 'POST',
                path: '/v0/app/auth/reauthenticate/code/request',
                body: { email: address },
              })
              if (sending !== 'sent') {
                await waitFor(() =>
                  expect(screen.getByTestId('prove-error').props.children).toBe(
                    said(sending, details, 'proveCodeSendError')
                  )
                )
                expect(screen.queryByTestId('prove-code-input')).toBeNull()
                await view.unmount()
                return
              }
              await waitFor(() => expect(screen.getByTestId('prove-code-input')).toBeTruthy())
              await fireEvent.changeText(screen.getByTestId('prove-code-input'), ` ${code} `)
              await fireEvent.press(screen.getByTestId('prove-code-submit'))
              await waitFor(() => expect(calls).toHaveLength(3))
              expect(calls[2]).toMatchObject({
                method: 'POST',
                path: '/v0/app/auth/reauthenticate/code/confirm',
                body: { code },
              })
              if (proving === 'proved') {
                await waitFor(() => expect(navigation.back).toHaveBeenCalledTimes(1))
              } else {
                await waitFor(() =>
                  expect(screen.getByTestId('prove-error').props.children).toBe(
                    said(proving, details, 'proveCodeError')
                  )
                )
                expect(navigation.back).not.toHaveBeenCalled()
              }
              await view.unmount()
            }
          )
        )
      } finally {
        process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY = 'false'
      }
    }
  )

  it('waits for the session, and offers nothing once the screen has gone', async () => {
    await fc.assert(
      fc.asyncProperty(account, async (user) => {
        const answer = held<Response>()
        serve(() => answer.promise)
        const view = await render(<Prove />)
        expect(screen.getByTestId('prove-loading')).toBeTruthy()
        await view.unmount()
        answer.release(ok({ user }))
        await new Promise((settle) => setTimeout(settle, 0))
        expect(screen.queryByTestId('prove-form')).toBeNull()
        expect(screen.queryByTestId('prove-set-password')).toBeNull()
      })
    )
  })
})
