import ProfilePassword from '@/app/(authenticated)/profile/password'

import { REFUSED, type Refused, ok, refusal, refusalDetails, said, serve } from '../../support/signedIn/server'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const password = fc.string({ minLength: 1, maxLength: 24 })

describe('the change password screen', () => {
  it('clears both fields and says so when the change is saved, and otherwise says why and keeps them', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant(''), password),
        password,
        fc.constantFrom<'saved' | Refused>('saved', ...REFUSED),
        refusalDetails,
        async (current, chosen, outcome, details) => {
          const calls = serve(() => (outcome === 'saved' ? ok({}) : refusal(outcome, details)))
          const view = await render(<ProfilePassword />)
          await fireEvent.changeText(screen.getByTestId('current-password-input'), current)
          await fireEvent.changeText(screen.getByTestId('new-password-input'), chosen)
          await fireEvent.press(screen.getByTestId('profile-password-submit'))
          await waitFor(() => expect(screen.getByTestId('profile-password-submit-label').props.children).toBe('Save'))
          expect(calls).toHaveLength(1)
          expect(calls[0]).toMatchObject({
            method: 'POST',
            path: '/v0/app/account/password/change',
            body: { current_password: current, new_password: chosen },
          })
          const saved = outcome === 'saved'
          expect(!!screen.queryByTestId('profile-password-success')).toBe(saved)
          expect(screen.getByTestId('current-password-input').props.value).toBe(saved ? '' : current)
          expect(screen.getByTestId('new-password-input').props.value).toBe(saved ? '' : chosen)
          if (outcome !== 'saved') {
            expect(screen.getByTestId('profile-password-error').props.children).toBe(
              said(outcome, details, 'profilePasswordError')
            )
          } else {
            expect(screen.queryByTestId('profile-password-error')).toBeNull()
          }
          await view.unmount()
        }
      )
    )
  })
})
