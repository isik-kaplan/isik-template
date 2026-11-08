import { PhoneSection } from '@/components/app-auth/PhoneSection'
import { VerifyPhoneForm } from '@/components/app-auth/VerifyPhoneForm'

import { sitePath } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { navigation, toast } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const number = fc.stringMatching(/^\+[1-9][0-9]{7,13}$/)
const code = fc.stringMatching(/^[0-9]{6}$/)
// A refusal names the field it is about, or none: then it is shown under the form's only field all the same.
const refusal = (message: string, param: string, aboutField: boolean) =>
  json(400, { status: 400, errors: [{ message, code: 'invalid', ...(aboutField ? { param } : {}) }] })
const flows = (id: string) => ({
  status: 401,
  data: { flows: [{ id, is_pending: true, types: ['totp'] }] },
  meta: { is_authenticated: false },
})

const VERIFIED = ['logged in', 'address owed', 'second factor owed', 'refused', 'refused, about no field'] as const
const ANSWERS: Record<(typeof VERIFIED)[number], () => Response> = {
  refused: () => refusal('Wrong code.', 'code', true),
  'refused, about no field': () => refusal('Wrong code.', 'code', false),
  'logged in': () => json(200, { status: 200, data: { user: {}, methods: [] }, meta: { is_authenticated: true } }),
  'address owed': () => json(401, flows('verify_email')),
  'second factor owed': () => json(401, flows('mfa_authenticate')),
}

describe('the code texted at signup or login', () => {
  test.prop([code, sitePath, fc.constantFrom(...VERIFIED)])(
    'goes on to whatever the login still owes, or says it was refused',
    async (typed, next, answer) => {
      freshDom()
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ANSWERS[answer]())
      )
      render(<VerifyPhoneForm redirectTo={next} />)
      fireEvent.change(screen.getByLabelText('Code'), { target: { value: typed } })
      fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
      const went = {
        'logged in': next,
        'address owed': '/auth/signup-email-sent',
        'second factor owed': `/auth/two-factor?next=${encodeURIComponent(next)}`,
      } as Record<string, string>
      if (answer.startsWith('refused')) expect(await screen.findByText('Wrong code.')).toBeTruthy()
      else await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(went[answer]))
      expect(navigation.refresh).toHaveBeenCalledTimes(answer === 'logged in' ? 1 : 0)
    }
  )

  test('is not sent blank', async () => {
    freshDom()
    const sent = vi.fn()
    vi.stubGlobal('fetch', sent)
    render(<VerifyPhoneForm redirectTo="/" />)
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('Could not verify that code.')).toBeTruthy()
    expect(sent).not.toHaveBeenCalled()
  })

  test.prop([fc.boolean()])('can be texted again, saying whether that worked', async (works) => {
    freshDom()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => (works ? json(200, { status: 200 }) : json(400, { status: 400, errors: [] })))
    )
    render(<VerifyPhoneForm redirectTo="/" />)
    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }))
    await vi.waitFor(() =>
      expect(works ? toast.success : toast.error).toHaveBeenCalledWith(
        works ? 'A new code is on its way.' : 'Could not send a new code.'
      )
    )
  })

  test.prop([fc.oneof(number, fc.stringMatching(/^[0-9]{3,8}$/)), fc.boolean(), fc.boolean()])(
    'can go to another number, which must be a whole international one',
    async (typed, works, aboutField) => {
      freshDom()
      const sent = vi.fn(async () => (works ? json(200, { status: 200 }) : refusal('Taken.', 'phone', aboutField)))
      vi.stubGlobal('fetch', sent)
      render(<VerifyPhoneForm redirectTo="/" />)
      fireEvent.click(screen.getByRole('button', { name: 'Wrong number?' }))
      fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: typed } })
      fireEvent.click(screen.getByRole('button', { name: 'Text this number instead' }))
      if (!typed.startsWith('+')) {
        expect(await screen.findByText(/with its \+ and country code/)).toBeTruthy()
        expect(sent).not.toHaveBeenCalled()
        return
      }
      if (works) {
        await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('We texted a code to the new number.'))
        expect(await screen.findByRole('button', { name: 'Wrong number?' })).toBeTruthy()
      } else expect(await screen.findByText('Taken.')).toBeTruthy()
    }
  )
})

describe("the account's number on the profile", () => {
  test.prop([
    fc.option(fc.record({ phone: number, verified: fc.boolean() }), { nil: null }),
    number,
    code,
    fc.constantFrom('verified', 'code refused', 'number refused'),
    fc.boolean(),
  ])(
    'replaces the old number only once the code texted to the new one comes back',
    async (initial, next, typed, what, aboutField) => {
      freshDom()
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const path = new URL((input as Request).url).pathname
          if (path.endsWith('/account/phone')) {
            return what === 'number refused'
              ? refusal('Taken.', 'phone', aboutField)
              : json(202, { status: 202, data: [{ phone: next, verified: false }] })
          }
          return what === 'code refused'
            ? refusal('Wrong code.', 'code', aboutField)
            : json(200, { status: 200, data: [{ phone: next, verified: true }] })
        })
      )
      render(<PhoneSection initialPhone={initial} />)
      if (initial) {
        expect(screen.getByText(initial.phone)).toBeTruthy()
        expect(screen.getByText(initial.verified ? 'Verified' : 'Unverified')).toBeTruthy()
      } else expect(screen.getByText('This account has no phone number.')).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: next } })
      fireEvent.click(screen.getByRole('button', { name: initial ? 'Change number' : 'Add number' }))
      if (what === 'number refused') {
        expect(await screen.findByText('Taken.')).toBeTruthy()
        return
      }
      expect(await screen.findByText(`We texted a code to ${next}.`)).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Code'), { target: { value: typed } })
      fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
      if (what === 'code refused') {
        expect(await screen.findByText('Wrong code.')).toBeTruthy()
        if (initial) expect(screen.getByText(initial.phone)).toBeTruthy()
        return
      }
      await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Phone number saved.'))
      expect(screen.getByText(next)).toBeTruthy()
      expect(screen.getByText('Verified')).toBeTruthy()
    }
  )
})
