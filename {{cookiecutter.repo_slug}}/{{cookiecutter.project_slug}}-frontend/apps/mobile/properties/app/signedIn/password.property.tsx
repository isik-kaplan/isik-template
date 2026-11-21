import ProfilePassword from '@/app/(authenticated)/profile/password'

import { REFUSED, type Refused, ok, refusal, refusalDetails, said, serve } from '../../support/signedIn/server'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const password = fc.string({ minLength: 1, maxLength: 24 })

// The build's EXPO_PUBLIC_SOCIAL_LOGIN_ONLY, unset meaning the answer given at generation.
function build(only: string | undefined): boolean {
  if (only === undefined) delete process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY
  else process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY = only
  return (only ?? '{{ cookiecutter.social_login_only|lower }}') === 'true'
}

describe('the change password screen', () => {
  // One property per answer, so each refusal is met in every run.
  it.each<'saved' | Refused>(['saved', ...REFUSED])(
    'clears both fields and says so when the change is saved, and otherwise says why and keeps them: %s',
    async (outcome) => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(fc.constant(''), password),
          password,
          refusalDetails,
          async (current, chosen, details) => {
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
    }
  )

  it('sends anybody who reaches it back to the profile when nobody signs in with a password', async () => {
    try {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom<string | undefined>('true', 'false', undefined), async (only) => {
          const withoutPasswords = build(only)
          const view = await render(<ProfilePassword />)
          if (withoutPasswords) {
            expect(view.getByTestId('redirect').props.accessibilityHint).toBe('/profile')
            expect(view.queryByTestId('current-password-input')).toBeNull()
          } else {
            expect(view.queryByTestId('redirect')).toBeNull()
            expect(view.getByTestId('current-password-input')).toBeTruthy()
          }
          await view.unmount()
        })
      )
    } finally {
      process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY = 'false'
    }
  })
})
