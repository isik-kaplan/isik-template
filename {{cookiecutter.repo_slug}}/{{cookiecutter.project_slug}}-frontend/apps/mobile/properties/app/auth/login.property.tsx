import Login from '@/app/login'
import type { NameRequirement } from '@/lib/nameRequirement'
import type { Phone } from '@/lib/phoneOption'

import {
  OUTCOMES,
  type Outcome,
  allauth,
  answerFor,
  email,
  handle,
  latch,
  number,
  password,
  refusalMessage,
  said,
  t,
  waitMessage,
} from '../../support/auth/allauth'
import { PHONES, REQUIREMENTS } from '../../support/auth/bake'
import { forgetNavigation, navigation } from '../../support/navigation'
import { kept } from '../../support/store'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const mockBake: { requirement: NameRequirement; phone: Phone } = { requirement: 'full_only', phone: 'none' }
jest.mock('@/lib/nameRequirement', () => ({
  get NAME_REQUIREMENT() {
    return mockBake.requirement
  },
}))
jest.mock('@/lib/phoneOption', () => ({
  get PHONE() {
    return mockBake.phone
  },
}))

// Only where the handle is required does every account have one to sign in with.
const HANDLE_SIGNS_IN: NameRequirement[] = ['username_with_optional_full', 'full_and_username', 'username_only']

function placeholderKey(byHandle: boolean, byPhone: boolean): string {
  if (byHandle && byPhone) return 'loginIdentifierWithPhonePlaceholder'
  if (byHandle) return 'loginIdentifierPlaceholder'
  if (byPhone) return 'loginEmailOrPhonePlaceholder'
  return 'emailPlaceholder'
}

const identifier = fc.oneof(
  email.map((value) => ({ kind: 'address', value })),
  handle.map((value) => ({ kind: 'handle', value })),
  number.map((value) => ({ kind: 'number', value }))
)

function sentAs(kind: string, byHandle: boolean, byPhone: boolean): string {
  if (kind === 'number' && byPhone) return 'phone'
  return byHandle && kind !== 'address' ? 'username' : 'email'
}

describe('the login screen', () => {
  // One property per phone option: a number signs in only under one of three, drawn beside the identifier.
  it.each(PHONES)(
    'sends what was typed as the identifier this project signs in with, and names those ways in on the field: %s',
    async (phone) => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...REQUIREMENTS),
          identifier,
          password,
          said,
          async (requirement, typed, secret, s) => {
            forgetNavigation()
            kept.clear()
            mockBake.requirement = requirement
            mockBake.phone = phone
            const gate = latch()
            const sent = allauth(async () => {
              await gate.shut
              return answerFor('signed in', s)
            })
            const byHandle = HANDLE_SIGNS_IN.includes(requirement)
            const byPhone = phone === 'required'
            const view = await render(<Login />)
            const field = view.getByTestId('email-input')
            expect(field.props.placeholder).toBe(t(placeholderKey(byHandle, byPhone)))
            expect(field.props.keyboardType).toBe(byHandle || byPhone ? 'default' : 'email-address')
            await fireEvent.changeText(field, typed.value)
            await fireEvent.changeText(view.getByTestId('password-input'), secret)
            void fireEvent.press(view.getByTestId('login-submit'))
            await waitFor(() =>
              expect(view.getByTestId('login-submit-label').props.children).toBe(t('loginSubmitting'))
            )
            gate.open()
            await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/(authenticated)/home'))
            expect(sent[0].path).toBe('/v0/app/auth/login')
            expect(sent[0].body).toEqual({ [sentAs(typed.kind, byHandle, byPhone)]: typed.value, password: secret })
            await view.unmount()
          }
        )
      )
    }
  )

  it('goes where the answer says, or says why it could not, whatever allauth answers', async () => {
    await fc.assert(
      fc.asyncProperty(said, async (s) => {
        mockBake.requirement = 'full_only'
        mockBake.phone = 'none'
        const destinations: Partial<Record<Outcome, [keyof typeof navigation, string]>> = {
          'signed in': ['replace', '/(authenticated)/home'],
          verify_phone: ['push', '/verify-phone'],
          mfa_authenticate: ['push', '/two-factor'],
        }
        for (const outcome of OUTCOMES) {
          forgetNavigation()
          kept.clear()
          allauth(() => answerFor(outcome, s))
          const view = await render(<Login />)
          await fireEvent.press(view.getByTestId('login-submit'))
          const destination = destinations[outcome]
          if (destination) {
            await waitFor(() => expect(navigation[destination[0]]).toHaveBeenCalledWith(destination[1]))
            expect(view.queryByTestId('login-error')).toBeNull()
          } else {
            const shown =
              waitMessage(outcome, s) ??
              refusalMessage(outcome, s) ??
              (outcome === 'verify_email' ? t('loginVerifyEmailRequired') : t('loginError'))
            await waitFor(() => expect(view.getByTestId('login-error').props.children).toBe(shown))
            expect(navigation.replace).not.toHaveBeenCalled()
          }
          expect(view.getByTestId('login-submit-label').props.children).toBe(t('loginSubmit'))
          await view.unmount()
        }
      })
    )
  })
})
