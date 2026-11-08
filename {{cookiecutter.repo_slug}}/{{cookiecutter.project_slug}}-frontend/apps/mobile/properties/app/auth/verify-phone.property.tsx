import VerifyPhone from '@/app/verify-phone'

import {
  OUTCOMES,
  type Outcome,
  allauth,
  answerFor,
  latch,
  number,
  refusalMessage,
  said,
  t,
  waitMessage,
} from '../../support/auth/allauth'
import { forgetNavigation, navigation } from '../../support/navigation'
import { kept } from '../../support/store'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const spaces = fc.stringMatching(/^[ \t]{0,3}$/)
const code = fc.stringMatching(/^[A-Z0-9]{6}$/)

describe('the verify-phone screen', () => {
  it('will not send a blank code, and sends a typed one without the spaces around it', async () => {
    await fc.assert(
      fc.asyncProperty(spaces, code, spaces, said, async (before, typed, after, s) => {
        forgetNavigation()
        kept.clear()
        const gate = latch()
        const sent = allauth(async () => {
          await gate.shut
          return answerFor('signed in', s)
        })
        const view = await render(<VerifyPhone />)
        const input = view.getByTestId('verify-phone-code-input')
        await fireEvent.changeText(input, before + after)
        expect(view.getByTestId('verify-phone-submit').props.accessibilityState.disabled).toBe(true)
        await fireEvent.changeText(input, before + typed + after)
        void fireEvent.press(view.getByTestId('verify-phone-submit'))
        await waitFor(() =>
          expect(view.getByTestId('verify-phone-submit-label').props.children).toBe(t('verifyPhoneSubmitting'))
        )
        gate.open()
        await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/(authenticated)/home'))
        expect(sent).toEqual([{ method: 'POST', path: '/v0/app/auth/phone/verify', body: { code: typed } }])
        await view.unmount()
      })
    )
  })

  it('goes where a verified code leads, or says why the code did not work', async () => {
    await fc.assert(
      fc.asyncProperty(code, said, async (typed, s) => {
        const destinations: Partial<Record<Outcome, [keyof typeof navigation, string]>> = {
          'signed in': ['replace', '/(authenticated)/home'],
          mfa_authenticate: ['push', '/two-factor'],
        }
        for (const outcome of OUTCOMES) {
          forgetNavigation()
          kept.clear()
          allauth(() => answerFor(outcome, s))
          const view = await render(<VerifyPhone />)
          await fireEvent.changeText(view.getByTestId('verify-phone-code-input'), typed)
          await fireEvent.press(view.getByTestId('verify-phone-submit'))
          const destination = destinations[outcome]
          if (destination) {
            await waitFor(() => expect(navigation[destination[0]]).toHaveBeenCalledWith(destination[1]))
            expect(view.queryByTestId('verify-phone-error')).toBeNull()
          } else if (outcome === 'verify_email') {
            await waitFor(() =>
              expect(view.getByTestId('verify-phone-notice').props.children).toBe(t('verifyPhoneThenEmail'))
            )
            expect(view.queryByTestId('verify-phone-error')).toBeNull()
          } else {
            const shown = waitMessage(outcome, s) ?? refusalMessage(outcome, s) ?? t('verifyPhoneError')
            await waitFor(() => expect(view.getByTestId('verify-phone-error').props.children).toBe(shown))
            expect(view.queryByTestId('verify-phone-notice')).toBeNull()
          }
          expect(view.getByTestId('verify-phone-submit-label').props.children).toBe(t('verifyPhoneSubmit'))
          await view.unmount()
        }
      })
    )
  })

  it('says a new code is coming when allauth sends one, and why not when it does not', async () => {
    await fc.assert(
      fc.asyncProperty(said, async (s) => {
        for (const outcome of OUTCOMES) {
          forgetNavigation()
          kept.clear()
          const sent = allauth(() => answerFor(outcome, s))
          const view = await render(<VerifyPhone />)
          await fireEvent.press(view.getByTestId('verify-phone-resend'))
          if (outcome === 'signed in') {
            await waitFor(() =>
              expect(view.getByTestId('verify-phone-notice').props.children).toBe(t('verifyPhoneResent'))
            )
          } else {
            const shown = waitMessage(outcome, s) ?? t('verifyPhoneResendError')
            await waitFor(() => expect(view.getByTestId('verify-phone-error').props.children).toBe(shown))
          }
          expect(sent.map((one) => one.path)).toEqual(['/v0/app/auth/phone/verify/resend'])
          await view.unmount()
        }
      })
    )
  })

  it('texts a typed number instead, clearing it once taken, and says why when it is not', async () => {
    await fc.assert(
      fc.asyncProperty(number, said, async (typed, s) => {
        for (const outcome of OUTCOMES) {
          forgetNavigation()
          kept.clear()
          const sent = allauth(() => answerFor(outcome, s))
          const view = await render(<VerifyPhone />)
          expect(view.getByTestId('verify-phone-change').props.accessibilityState.disabled).toBe(true)
          await fireEvent.changeText(view.getByTestId('verify-phone-number-input'), typed)
          await fireEvent.press(view.getByTestId('verify-phone-change'))
          if (outcome === 'signed in') {
            await waitFor(() =>
              expect(view.getByTestId('verify-phone-notice').props.children).toBe(t('verifyPhoneChanged'))
            )
            expect(view.getByTestId('verify-phone-number-input').props.value).toBe('')
          } else {
            const shown = waitMessage(outcome, s) ?? refusalMessage(outcome, s) ?? t('verifyPhoneChangeError')
            await waitFor(() => expect(view.getByTestId('verify-phone-error').props.children).toBe(shown))
            expect(view.getByTestId('verify-phone-number-input').props.value).toBe(typed)
          }
          expect(sent).toEqual([{ method: 'POST', path: '/v0/app/account/phone', body: { phone: typed } }])
          await view.unmount()
        }
      })
    )
  })
})
