import ForgotPassword from '@/app/forgot-password'

import { allauth, email, json, latch, t } from '../../support/auth/allauth'
import { forgetNavigation } from '../../support/navigation'
import { kept } from '../../support/store'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

describe('the forgot-password screen', () => {
  it('asks for a link to the typed address and says it was sent whatever allauth answers', async () => {
    await fc.assert(
      fc.asyncProperty(email, fc.constantFrom(200, 400, 429, 500), async (address, status) => {
        forgetNavigation()
        kept.clear()
        const gate = latch()
        const sent = allauth(async () => {
          await gate.shut
          return json(status, { status })
        })
        const view = await render(<ForgotPassword />)
        await fireEvent.changeText(view.getByTestId('email-input'), address)
        void fireEvent.press(view.getByTestId('forgot-password-submit'))
        await waitFor(() =>
          expect(view.getByTestId('forgot-password-submit-label').props.children).toBe(t('forgotPasswordSubmitting'))
        )
        gate.open()
        await waitFor(() =>
          expect(view.getByTestId('forgot-password-sent-message').props.children).toBe(
            t('forgotPasswordSentMessage', { email: address })
          )
        )
        expect(view.getByTestId('login-link').props.accessibilityHint).toBe('/login')
        expect(sent).toEqual([{ method: 'POST', path: '/v0/app/auth/password/request', body: { email: address } }])
        await view.unmount()
      })
    )
  })
})
