import { useState } from 'react'

import { MfaChallengeForm } from '@/components/app-auth/MfaChallengeForm'
import { SegmentedCodeInput } from '@/components/base/segmented-code-input'

import { freshDom } from '../../support/dom'
import { navigation } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const credential = vi.hoisted(() => ({ answer: null as Record<string, unknown> | null }))
vi.mock('@isikk/core/webauthn', () => ({
  getCredential: vi.fn(async () => {
    if (credential.answer === null) throw new Error('dismissed')
    return credential.answer
  }),
}))

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

function Controlled({ groups, initial = '' }: { groups: string; initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <SegmentedCodeInput
        value={value}
        onChange={setValue}
        groups={groups}
        label="Code"
        digitLabel={(at, total) => `Digit ${at} of ${total}`}
        name="code"
      />
      <output>{value}</output>
    </>
  )
}

const boxesOf = () => screen.getAllByRole('textbox') as HTMLInputElement[]

describe('a code typed one digit a box', () => {
  const layout = fc
    .array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 3 })
    .map((sizes) => sizes.join('-'))

  test.prop([layout, fc.string({ maxLength: 12 })])(
    'holds only the digits typed, as many as there are boxes',
    (groups, typed) => {
      freshDom()
      render(<Controlled groups={groups} />)
      const total = boxesOf().length
      expect(total).toBe(groups.split('-').reduce((sum, size) => sum + Number(size), 0))
      let at = 0
      for (const key of typed) {
        fireEvent.keyDown(boxesOf()[Math.min(at, total - 1)], { key })
        if (/^\d$/.test(key)) at++
      }
      const digits = typed.replace(/\D/g, '')
      const kept = digits.length > total ? digits.slice(0, total - 1) + digits[digits.length - 1] : digits
      expect(document.querySelector('output')?.textContent).toBe(kept.slice(0, total))
      expect((document.querySelector('input[type=hidden]') as HTMLInputElement).value).toBe(kept.slice(0, total))
    }
  )

  test.prop([layout, fc.string({ maxLength: 14 }), fc.nat()])(
    'takes a pasted code from the box it lands in onward',
    (groups, pasted, landing) => {
      freshDom()
      render(<Controlled groups={groups} />)
      const total = boxesOf().length
      const from = landing % total
      fireEvent.paste(boxesOf()[from], { clipboardData: { getData: () => pasted } })
      const digits = pasted.replace(/\D/g, '').slice(0, total - from)
      expect(document.querySelector('output')?.textContent).toBe(digits ? ' '.repeat(from) + digits : '')
    }
  )

  test.prop([fc.stringMatching(/^\d{6}$/), fc.integer({ min: 0, max: 5 })])(
    'clears a box, then the one before, and walks with the arrows',
    (code, at) => {
      freshDom()
      render(<Controlled groups="3-3" initial={code} />)
      const boxes = boxesOf()
      fireEvent.change(boxes[at], { target: { value: '' } })
      const cleared = code.split('')
      cleared[at] = ' '
      expect(document.querySelector('output')?.textContent).toBe(cleared.join('').trimEnd())
      fireEvent.keyDown(boxes[at], { key: 'Backspace' })
      if (at > 0) cleared[at - 1] = ' '
      expect(document.querySelector('output')?.textContent).toBe(cleared.join('').trimEnd())
      fireEvent.keyDown(boxes[at], { key: 'ArrowLeft' })
      fireEvent.keyDown(boxes[at], { key: 'ArrowRight' })
      fireEvent.change(boxes[at], { target: { value: 'x' } })
      expect(document.querySelector('output')?.textContent).toBe(cleared.join('').trimEnd())
      fireEvent.focus(boxes[at])
    }
  )
})

type Factor = 'totp' | 'recovery_codes' | 'webauthn'

describe('the second step of a login', () => {
  const factors = fc.subarray<Factor>(['totp', 'recovery_codes', 'webauthn'], { minLength: 1 })

  test.prop([factors, fc.boolean(), fc.constantFrom('login' as const, 'prove' as const)])(
    'offers each factor the account has, and only those this browser can use',
    (types, browserHasPasskeys) => {
      freshDom()
      Object.defineProperty(window, 'PublicKeyCredential', {
        configurable: true,
        value: browserHasPasskeys ? class {} : undefined,
      })
      render(<MfaChallengeForm types={types} redirectTo="/" />)
      // The authenticator's boxes when the account has one; the recovery field otherwise.
      expect(screen.queryByRole('group', { name: 'Authentication code' }) !== null).toBe(types.includes('totp'))
      expect(screen.queryByLabelText('Recovery code') !== null).toBe(!types.includes('totp'))
      expect(screen.queryByRole('button', { name: 'Use a recovery code instead' }) !== null).toBe(
        types.includes('totp') && types.includes('recovery_codes')
      )
      expect(screen.queryByRole('button', { name: 'Use a passkey' }) !== null).toBe(
        types.includes('webauthn') && browserHasPasskeys
      )
    }
  )

  test.prop([
    fc.constantFrom('login' as const, 'prove' as const),
    fc.stringMatching(/^[A-Za-z0-9-]{4,12}$/),
    fc.webPath(),
    fc.constantFrom(200, 400, 429),
  ])(
    'sends the trimmed code to the step it answers, leaving on success and saying why otherwise',
    async (purpose, code, next, status) => {
      freshDom()
      navigation.push.mockClear()
      const sent = vi.fn(async (_input: RequestInfo | URL) => {
        if (status === 200) return json(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
        if (status === 429) return json(429, {}, { 'Retry-After': '7' })
        return json(400, { status: 400, errors: [{ code: 'incorrect_code', param: 'code', message: 'Wrong code.' }] })
      })
      vi.stubGlobal('fetch', sent)
      render(<MfaChallengeForm types={['recovery_codes']} redirectTo={next} purpose={purpose} />)

      const submit = screen
        .getAllByRole('button')
        .find((button) => button.getAttribute('type') === 'submit') as HTMLButtonElement
      expect(submit.disabled).toBe(true)
      fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: `  ${code} ` } })
      fireEvent.click(submit)

      // The first call can be the GET that primes a CSRF cookie; the answer is the POST.
      const posted = () =>
        sent.mock.calls
          .map(([input]) => input)
          .find((input) => input instanceof Request && input.method === 'POST') as Request
      await vi.waitFor(() => expect(posted()).toBeDefined())
      const request = posted()
      expect(new URL(request.url).pathname).toBe(
        purpose === 'login' ? '/v0/browser/auth/2fa/authenticate' : '/v0/browser/auth/2fa/reauthenticate'
      )
      expect(await request.json()).toEqual({ code })
      if (status === 200) await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(next))
      if (status === 400) expect(await screen.findByText('Wrong code.')).toBeTruthy()
      if (status !== 200) expect(navigation.push).not.toHaveBeenCalled()
    }
  )

  // One property per purpose: each has its own passkey call, reached only when the prompt is confirmed.
  for (const purpose of ['login', 'prove'] as const)
    test.prop([fc.boolean(), fc.constantFrom(200, 400, 429), fc.webPath()])(
      `answers with a passkey, treating a dismissed prompt as a way back rather than a failure: ${purpose}`,
      async (confirmed, status, next) => {
        freshDom()
        navigation.push.mockClear()
        Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: class {} })
        credential.answer = confirmed ? { id: 'cred' } : null
        const sent = vi.fn(async (input: RequestInfo | URL) => {
          const request = input as Request
          if (request.method === 'GET') {
            return status === 429
              ? json(429, {}, { 'Retry-After': '3' })
              : json(200, { status: 200, data: { request_options: { publicKey: { challenge: 'x' } } } })
          }
          return status === 400
            ? json(400, { status: 400, errors: [{ code: 'bad', message: 'Not that one.' }] })
            : json(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
        })
        vi.stubGlobal('fetch', sent)
        render(<MfaChallengeForm types={['webauthn', 'totp', 'recovery_codes']} redirectTo={next} purpose={purpose} />)

        fireEvent.click(screen.getByRole('button', { name: 'Use a passkey' }))

        await vi.waitFor(() => expect(sent).toHaveBeenCalled())
        await new Promise((resolve) => setTimeout(resolve, 0))
        const posted = sent.mock.calls.map(([input]) => input as Request).filter((request) => request.method === 'POST')
        const reached = status !== 429 && confirmed
        expect(posted.length).toBe(reached ? 1 : 0)
        if (status === 429) expect(await screen.findByText(/3/)).toBeTruthy()
        if (reached && status === 200) await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(next))
        if (reached && status === 400) expect(await screen.findByText('Not that one.')).toBeTruthy()
      }
    )

  test.prop([fc.stringMatching(/^\d{6}$/)])(
    'switches between the authenticator and a recovery code, starting either empty',
    (code) => {
      freshDom()
      render(<MfaChallengeForm types={['totp', 'recovery_codes']} redirectTo="/" />)
      const boxes = boxesOf()
      fireEvent.paste(boxes[0], { clipboardData: { getData: () => code } })
      fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code instead' }))
      expect((screen.getByLabelText('Recovery code') as HTMLInputElement).value).toBe('')
      fireEvent.click(screen.getByRole('button', { name: 'Use your authenticator app instead' }))
      expect(boxesOf().every((box) => box.value === '')).toBe(true)
    }
  )
})
