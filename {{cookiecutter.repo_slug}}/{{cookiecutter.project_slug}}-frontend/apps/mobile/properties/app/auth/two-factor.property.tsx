import TwoFactor from '@/app/two-factor'

import { OUTCOMES, allauth, answerFor, latch, refusalMessage, said, t, waitMessage } from '../../support/auth/allauth'
import { forgetNavigation, navigation } from '../../support/navigation'
import { kept } from '../../support/store'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const spaces = fc.stringMatching(/^[ \t]{0,3}$/)
const code = fc.oneof(fc.stringMatching(/^[0-9]{6}$/), fc.stringMatching(/^[a-z0-9]{8}$/))

describe('the two-factor screen', () => {
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
        const view = await render(<TwoFactor />)
        const input = view.getByTestId('two-factor-code-input')
        await fireEvent.changeText(input, before + after)
        expect(view.getByTestId('two-factor-submit').props.accessibilityState.disabled).toBe(true)
        await fireEvent.changeText(input, before + typed + after)
        void fireEvent.press(view.getByTestId('two-factor-submit'))
        await waitFor(() =>
          expect(view.getByTestId('two-factor-submit-label').props.children).toBe(t('twoFactorSubmitting'))
        )
        gate.open()
        await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/(authenticated)/home'))
        expect(sent).toEqual([{ method: 'POST', path: '/v0/app/auth/2fa/authenticate', body: { code: typed } }])
        await view.unmount()
      })
    )
  })

  it('goes home when signed in, and otherwise says why the code did not work', async () => {
    await fc.assert(
      fc.asyncProperty(code, said, async (typed, s) => {
        for (const outcome of OUTCOMES) {
          forgetNavigation()
          kept.clear()
          allauth(() => answerFor(outcome, s))
          const view = await render(<TwoFactor />)
          await fireEvent.changeText(view.getByTestId('two-factor-code-input'), typed)
          await fireEvent.press(view.getByTestId('two-factor-submit'))
          if (outcome === 'signed in') {
            await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/(authenticated)/home'))
            expect(view.queryByTestId('two-factor-error')).toBeNull()
          } else {
            const shown = waitMessage(outcome, s) ?? refusalMessage(outcome, s) ?? t('twoFactorError')
            await waitFor(() => expect(view.getByTestId('two-factor-error').props.children).toBe(shown))
            expect(navigation.replace).not.toHaveBeenCalled()
          }
          expect(view.getByTestId('two-factor-submit-label').props.children).toBe(t('twoFactorSubmit'))
          await view.unmount()
        }
      })
    )
  })
})
