import ProfilePhone from '@/app/(authenticated)/profile/phone'

import {
  type Drawn,
  REFUSED,
  type Refused,
  held,
  json,
  ok,
  phoneNumber,
  refusal,
  refusalDetails,
  said,
  serve,
} from '../../support/signedIn/server'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const PATH = '/v0/app/account/phone'
const onFile = fc.option(fc.record({ phone: phoneNumber, verified: fc.boolean() }), { nil: null })
type OnFile = Drawn<typeof onFile>
// A code as typed: surrounding space is the keyboard's, not the code's.
const code = fc
  .tuple(fc.constantFrom('', ' ', '  '), fc.stringMatching(/^[A-Z0-9]{4,8}$/), fc.constantFrom('', ' '))
  .map(([before, digits, after]) => ({ typed: `${before}${digits}${after}`, digits }))

function current(phone: OnFile) {
  if (!phone) return 'This account has no phone number.'
  return `${phone.phone}${phone.verified ? '' : ' (unverified)'}`
}

async function sendTo(number: string) {
  await fireEvent.changeText(screen.getByTestId('profile-phone-number-input'), number)
  await fireEvent.press(screen.getByTestId('profile-phone-send'))
}

describe('the phone number screen', () => {
  it('shows the number on file, or that there is none, whatever the server answers', async () => {
    await fc.assert(
      fc.asyncProperty(onFile, fc.constantFrom('held', 'none held', 'failed'), async (phone, answer) => {
        serve(() => {
          if (answer === 'failed') return json(401, { status: 401, meta: { is_authenticated: false } })
          return ok(answer === 'held' && phone ? [phone] : [])
        })
        const view = await render(<ProfilePhone />)
        const expected = answer === 'held' ? phone : null
        await waitFor(() => expect(screen.getByTestId('profile-phone-current').props.children).toBe(current(expected)))
        expect(screen.getByTestId('profile-phone-send').props.accessibilityState.disabled).toBe(true)
        await view.unmount()
      })
    )
  })

  it('shows nothing it hears after the screen has gone', async () => {
    await fc.assert(
      fc.asyncProperty(onFile, async (phone) => {
        const answer = held<Response>()
        serve(() => answer.promise)
        const view = await render(<ProfilePhone />)
        await view.unmount()
        answer.release(ok(phone ? [phone] : []))
        await new Promise((settle) => setTimeout(settle, 0))
        expect(screen.queryByTestId('profile-phone-current')).toBeNull()
      })
    )
  })

  it('asks for the code only once the new number was texted, and otherwise says why', async () => {
    await fc.assert(
      fc.asyncProperty(
        onFile,
        phoneNumber,
        fc.constantFrom<'texted' | Refused>('texted', ...REFUSED),
        refusalDetails,
        async (phone, number, outcome, details) => {
          const calls = serve(({ method }) => {
            if (method === 'GET') return ok(phone ? [phone] : [])
            return outcome === 'texted' ? ok([{ phone: number, verified: false }]) : refusal(outcome, details)
          })
          const view = await render(<ProfilePhone />)
          await waitFor(() => expect(screen.getByTestId('profile-phone-current').props.children).toBe(current(phone)))
          await sendTo(number)
          await waitFor(() => expect(calls).toHaveLength(2))
          expect(calls[1]).toMatchObject({ method: 'POST', path: PATH, body: { phone: number } })
          if (outcome === 'texted') {
            await waitFor(() =>
              expect(screen.getByTestId('profile-phone-code-sent').props.children).toBe(
                `We texted a code to ${number}.`
              )
            )
            expect(screen.getByTestId('profile-phone-verify').props.accessibilityState.disabled).toBe(true)
          } else {
            await waitFor(() =>
              expect(screen.getByTestId('profile-phone-error').props.children).toBe(
                said(outcome, details, 'profilePhoneChangeError')
              )
            )
            expect(screen.getByTestId('profile-phone-number-input').props.value).toBe(number)
          }
          expect(screen.getByTestId('profile-phone-current').props.children).toBe(current(phone))
          await view.unmount()
        }
      )
    )
  })

  // One property per outcome, so a right code and a refused one are both reached every run.
  it.each([
    ['comes back right', fc.constant<'verified' | Refused>('verified')],
    ['is refused', fc.constantFrom<'verified' | Refused>(...REFUSED)],
  ])(
    'replaces the number on file only once its code comes back right, and otherwise says why: %s',
    async (_case, outcomes) => {
      await fc.assert(
        fc.asyncProperty(
          onFile,
          phoneNumber,
          code,
          outcomes,
          refusalDetails,
          async (phone, number, { typed, digits }, outcome, details) => {
            const calls = serve(({ method, path }) => {
              if (method === 'GET') return ok(phone ? [phone] : [])
              if (path === PATH) return ok([{ phone: number, verified: false }])
              return outcome === 'verified' ? ok({}) : refusal(outcome, details)
            })
            const view = await render(<ProfilePhone />)
            await waitFor(() => expect(screen.getByTestId('profile-phone-current').props.children).toBe(current(phone)))
            await sendTo(number)
            await waitFor(() => expect(screen.getByTestId('profile-phone-code-input')).toBeTruthy())
            await fireEvent.changeText(screen.getByTestId('profile-phone-code-input'), typed)
            await fireEvent.press(screen.getByTestId('profile-phone-verify'))
            await waitFor(() => expect(calls).toHaveLength(3))
            expect(calls[2]).toMatchObject({
              method: 'POST',
              path: '/v0/app/auth/phone/verify',
              body: { code: digits },
            })
            if (outcome === 'verified') {
              await waitFor(() => expect(screen.getByTestId('profile-phone-saved')).toBeTruthy())
              expect(screen.getByTestId('profile-phone-current').props.children).toBe(number)
              expect(screen.getByTestId('profile-phone-number-input').props.value).toBe('')
              // Sending another number takes the saved notice away.
              await sendTo(number)
              await waitFor(() => expect(screen.queryByTestId('profile-phone-saved')).toBeNull())
            } else {
              await waitFor(() =>
                expect(screen.getByTestId('profile-phone-error').props.children).toBe(
                  said(outcome, details, 'verifyPhoneError')
                )
              )
              expect(screen.getByTestId('profile-phone-current').props.children).toBe(current(phone))
              expect(screen.getByTestId('profile-phone-code-input').props.value).toBe(typed)
            }
            await view.unmount()
          }
        )
      )
    }
  )
})
