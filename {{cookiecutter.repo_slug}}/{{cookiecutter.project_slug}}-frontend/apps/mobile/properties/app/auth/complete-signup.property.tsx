import CompleteSignup from '@/app/complete-signup'
import type { NameRequirement } from '@/lib/nameRequirement'
import type { NameField } from '@/lib/names'
import type { Phone } from '@/lib/phoneOption'

import {
  OUTCOMES,
  type Outcome,
  type Said,
  allauth,
  answerFor,
  email,
  handle,
  json,
  latch,
  number,
  password,
  refusalMessage,
  said,
  t,
  waitMessage,
} from '../../support/auth/allauth'
import { NAME_INPUTS, PHONES, REQUIREMENTS, askedOf, names } from '../../support/auth/bake'
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

const PENDING_PATH = '/v0/app/auth/provider/signup'

const pendingSignup = (address: string, username: string | null) =>
  json(200, { status: 200, data: { user: { email: address, ...(username === null ? {} : { username }) } } })

describe('the screen that finishes a signup begun at a provider', () => {
  it('sends a visit with no signup pending back to login, and shows nothing meanwhile', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(401, 403, 404, 409, 500), async (status) => {
        forgetNavigation()
        kept.clear()
        allauth(() => json(status, { status }))
        const view = await render(<CompleteSignup />)
        await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/login'))
        expect(view.toJSON()).toBeNull()
        await view.unmount()
      })
    )
  })

  it('shows the address being signed up and sends it with the asked names, a typed number and the password', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...REQUIREMENTS),
        fc.constantFrom(...PHONES),
        email,
        fc.option(handle, { nil: null }),
        names,
        fc.option(number, { nil: '' }),
        password,
        said,
        async (requirement, phone, address, providerHandle, typedNames, typedNumber, secret, s) => {
          forgetNavigation()
          kept.clear()
          mockBake.requirement = requirement
          mockBake.phone = phone
          const gate = latch()
          const sent = allauth(async (request) => {
            if (request.method === 'GET') return pendingSignup(address, providerHandle)
            await gate.shut
            return answerFor('signed in', s)
          })
          const view = await render(<CompleteSignup />)
          await waitFor(() => expect(view.getByTestId('complete-signup-email').props.children).toBe(address))
          const asked = askedOf(requirement, typedNames)
          const handleInput = view.queryByTestId(NAME_INPUTS.username)
          if (handleInput) expect(handleInput.props.value).toBe(providerHandle ?? '')
          for (const name of Object.keys(NAME_INPUTS) as NameField[]) {
            const input = view.queryByTestId(NAME_INPUTS[name])
            expect(input !== null).toBe(name in asked)
            if (input) await fireEvent.changeText(input, typedNames[name])
          }
          const phoneInput = view.queryByTestId('phone-input')
          expect(phoneInput !== null).toBe(phone !== 'none')
          if (phoneInput) {
            expect(phoneInput.props.placeholder).toBe(
              t(phone === 'required' ? 'phonePlaceholder' : 'phoneOptionalPlaceholder')
            )
            await fireEvent.changeText(phoneInput, typedNumber)
          }
          await fireEvent.changeText(view.getByTestId('password-input'), secret)
          void fireEvent.press(view.getByTestId('complete-signup-submit'))
          await waitFor(() =>
            expect(view.getByTestId('complete-signup-submit-label').props.children).toBe(t('completeSignupSubmitting'))
          )
          gate.open()
          await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/(authenticated)/home'))
          const numberSent = phone !== 'none' && typedNumber ? { phone: typedNumber } : {}
          expect(sent[1]).toEqual({
            method: 'POST',
            path: PENDING_PATH,
            body: { email: address, ...numberSent, password: secret, ...asked },
          })
          await view.unmount()
        }
      )
    )
  })

  it('goes home when signed in, to login when the account waits on something, and says why when refused', async () => {
    await fc.assert(
      fc.asyncProperty(email, said, async (address, s: Said) => {
        mockBake.requirement = 'full_only'
        mockBake.phone = 'optional'
        // Anything that is neither a refusal nor a throttle made the account; only signing in waits elsewhere.
        const destinations: Partial<Record<Outcome, [keyof typeof navigation, string]>> = {
          'signed in': ['replace', '/(authenticated)/home'],
          verify_phone: ['push', '/verify-phone'],
          verify_email: ['replace', '/login'],
          mfa_authenticate: ['replace', '/login'],
          'refused with an empty list': ['replace', '/login'],
          'refused without a list': ['replace', '/login'],
        }
        for (const outcome of OUTCOMES) {
          forgetNavigation()
          kept.clear()
          allauth((request) => (request.method === 'GET' ? pendingSignup(address, null) : answerFor(outcome, s)))
          const view = await render(<CompleteSignup />)
          await waitFor(() => expect(view.getByTestId('complete-signup-submit')).toBeTruthy())
          await fireEvent.press(view.getByTestId('complete-signup-submit'))
          const destination = destinations[outcome]
          if (destination) {
            await waitFor(() => expect(navigation[destination[0]]).toHaveBeenCalledWith(destination[1]))
            expect(view.queryByTestId('complete-signup-error')).toBeNull()
          } else {
            const shown = waitMessage(outcome, s) ?? refusalMessage(outcome, s)
            await waitFor(() => expect(view.getByTestId('complete-signup-error').props.children).toBe(shown))
            expect(navigation.replace).not.toHaveBeenCalled()
          }
          expect(view.getByTestId('complete-signup-submit-label').props.children).toBe(t('completeSignupSubmit'))
          await view.unmount()
        }
      })
    )
  })
})
