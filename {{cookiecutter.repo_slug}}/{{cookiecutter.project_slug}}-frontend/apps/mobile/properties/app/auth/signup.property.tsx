import Signup from '@/app/signup'
import type { NameRequirement } from '@/lib/nameRequirement'
import type { NameField } from '@/lib/names'
import type { Phone } from '@/lib/phoneOption'

import {
  OUTCOMES,
  type Outcome,
  allauth,
  answerFor,
  email,
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

describe('the signup screen', () => {
  it('sends the names this project asks for, the address, a number only when one was typed, and the password', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...REQUIREMENTS),
        fc.constantFrom(...PHONES),
        names,
        email,
        fc.option(number, { nil: '' }),
        password,
        said,
        async (requirement, phone, typedNames, address, typedNumber, secret, s) => {
          forgetNavigation()
          kept.clear()
          mockBake.requirement = requirement
          mockBake.phone = phone
          const gate = latch()
          const sent = allauth(async () => {
            await gate.shut
            return answerFor('signed in', s)
          })
          const view = await render(<Signup />)
          for (const name of Object.keys(NAME_INPUTS) as NameField[]) {
            const input = view.queryByTestId(NAME_INPUTS[name])
            expect(input !== null).toBe(name in askedOf(requirement, typedNames))
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
          await fireEvent.changeText(view.getByTestId('email-input'), address)
          await fireEvent.changeText(view.getByTestId('password-input'), secret)
          void fireEvent.press(view.getByTestId('signup-submit'))
          await waitFor(() =>
            expect(view.getByTestId('signup-submit-label').props.children).toBe(t('signupSubmitting'))
          )
          gate.open()
          await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/(authenticated)/home'))
          const numberSent = phone !== 'none' && typedNumber ? { phone: typedNumber } : {}
          expect(sent[0].path).toBe('/v0/app/auth/signup')
          expect(sent[0].body).toEqual({
            email: address,
            ...numberSent,
            password: secret,
            ...askedOf(requirement, typedNames),
          })
          await view.unmount()
        }
      )
    )
  })

  it('goes where the answer says, or says why it could not, whatever allauth answers', async () => {
    await fc.assert(
      fc.asyncProperty(said, async (s) => {
        mockBake.requirement = 'full_only'
        mockBake.phone = 'optional'
        const destinations: Partial<Record<Outcome, [keyof typeof navigation, string]>> = {
          'signed in': ['replace', '/(authenticated)/home'],
          verify_phone: ['push', '/verify-phone'],
        }
        for (const outcome of OUTCOMES) {
          forgetNavigation()
          kept.clear()
          allauth(() => answerFor(outcome, s))
          const view = await render(<Signup />)
          await fireEvent.press(view.getByTestId('signup-submit'))
          const destination = destinations[outcome]
          if (destination) {
            await waitFor(() => expect(navigation[destination[0]]).toHaveBeenCalledWith(destination[1]))
            expect(view.queryByTestId('signup-error')).toBeNull()
          } else {
            const shown = waitMessage(outcome, s) ?? refusalMessage(outcome, s) ?? t('signupError')
            await waitFor(() => expect(view.getByTestId('signup-error').props.children).toBe(shown))
            expect(navigation.replace).not.toHaveBeenCalled()
          }
          expect(view.getByTestId('signup-submit-label').props.children).toBe(t('signupSubmit'))
          await view.unmount()
        }
      })
    )
  })
})
