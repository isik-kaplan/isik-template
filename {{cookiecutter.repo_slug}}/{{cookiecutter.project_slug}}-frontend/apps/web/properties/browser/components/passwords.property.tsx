import { ChangePasswordForm } from '@/components/app-auth/ChangePasswordForm'
import { ForgotPasswordForm } from '@/components/app-auth/ForgotPasswordForm'
import { ProvePasswordForm } from '@/components/app-auth/ProvePasswordForm'
import { ProveSetPasswordByEmail } from '@/components/app-auth/ProveSetPasswordByEmail'
import { ResetPasswordForm } from '@/components/app-auth/ResetPasswordForm'
import { VerifyEmailButton } from '@/components/app-auth/VerifyEmailButton'

import { address, allauthRefusal, sitePath } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { calls, navigation, toast } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const password = fc.stringMatching(/^[A-Za-z0-9]{8,20}$/)
const key = fc.stringMatching(/^[A-Za-z0-9:_-]{6,30}$/)

function answering(response: () => Response) {
  const sent = vi.fn(async () => response())
  vi.stubGlobal('fetch', sent)
  const posted = () =>
    calls(sent)
      .map(([input]) => input)
      .find((input) => input instanceof Request && input.method === 'POST') as Request | undefined
  return posted
}

const respond = (status: number, field?: string) => () => {
  if (status === 200) return json(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
  if (status === 401)
    return json(401, { status: 401, data: { flows: [{ id: 'login' }] }, meta: { is_authenticated: false } })
  return allauthRefusal('Expired.', field)
}

describe('forgetting a password', () => {
  test.prop([address, fc.boolean()])(
    'asks for a link for the address, never saying whether it exists',
    async (email, refused) => {
      freshDom()
      navigation.push.mockClear()
      const posted = answering(() => (refused ? json(429, {}) : json(200, { status: 200 })))
      render(<ForgotPasswordForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
      fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
      await vi.waitFor(() => expect(posted()).toBeDefined())
      expect(await (posted() as Request).json()).toEqual({ email })
      if (refused) await vi.waitFor(() => expect(toast.error).toHaveBeenCalled())
      else await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/auth/password-reset-email-sent'))
    }
  )

  test.prop([fc.stringMatching(/^[a-z]{1,10}$/)])(
    'refuses something that is not an address, asking nothing',
    async (typed) => {
      freshDom()
      const posted = answering(() => json(200, {}))
      const { container } = render(<ForgotPasswordForm />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: typed } })
      fireEvent.submit(container.querySelector('form') as HTMLFormElement)
      expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
      expect(posted()).toBeUndefined()
    }
  )
})

describe('a reset link', () => {
  // One property per answer: a refusal about the password is one draw in twelve otherwise.
  for (const [status, field] of [
    [200, undefined],
    [401, undefined],
    [400, 'key'],
    [400, 'password'],
    [400, undefined],
  ] as const)
    test.prop([key, password])(
      `sets the new password with its key, and goes home or to login, or says it expired: ${status}${field ? ` about the ${field}` : ''}`,
      async (resetKey, secret) => {
        freshDom()
        navigation.push.mockClear()
        const posted = answering(respond(status, field))
        render(<ResetPasswordForm resetKey={resetKey} />)
        fireEvent.change(screen.getByLabelText('New password'), { target: { value: secret } })
        fireEvent.click(screen.getByRole('button', { name: 'Set new password' }))
        await vi.waitFor(() => expect(posted()).toBeDefined())
        expect(await (posted() as Request).json()).toEqual({ key: resetKey, password: secret })
        if (status === 400) expect(await screen.findByText('Expired.')).toBeTruthy()
        else await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(status === 200 ? '/' : '/auth/login'))
      }
    )
})

describe('an email confirmation link', () => {
  for (const status of [200, 401, 400, 429])
    test.prop([key])(
      `confirms with its key, saying beside the button why when it cannot: ${status}`,
      async (verificationKey) => {
        freshDom()
        navigation.push.mockClear()
        const posted = answering(status === 429 ? () => json(429, {}, { 'Retry-After': '9' }) : respond(status, 'key'))
        render(<VerifyEmailButton verificationKey={verificationKey} />)
        fireEvent.click(screen.getByRole('button', { name: 'Confirm email address' }))
        await vi.waitFor(() => expect(posted()).toBeDefined())
        expect(await (posted() as Request).json()).toEqual({ key: verificationKey })
        if (status === 400) expect(await screen.findByText('That verification link is no longer valid.')).toBeTruthy()
        else if (status === 429) expect(await screen.findByText(/9/)).toBeTruthy()
        else await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(status === 200 ? '/' : '/auth/login'))
      }
    )
})

describe('changing a password', () => {
  // One property per answer, each refusal about each field or none.
  for (const [refused, field] of [
    [false, undefined],
    [true, 'current_password'],
    [true, 'new_password'],
    [true, undefined],
  ] as const)
    test.prop([password, password])(
      `sends both, and empties the form once it changed: ${refused ? `refused about ${field ?? 'nothing'}` : 'changed'}`,
      async (current, next) => {
        freshDom()
        const posted = answering(() =>
          refused ? allauthRefusal('Not your password.', field) : json(200, { status: 200 })
        )
        render(<ChangePasswordForm />)
        fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } })
        fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } })
        fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
        await vi.waitFor(() => expect(posted()).toBeDefined())
        expect(await (posted() as Request).json()).toEqual({ current_password: current, new_password: next })
        if (refused) {
          expect(await screen.findByText('Not your password.')).toBeTruthy()
          expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe(next)
        } else {
          await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Password changed.'))
          expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('')
        }
      }
    )
})

describe('proving who you are', () => {
  // One property per answer, a refusal about the password and about nothing each its own.
  for (const [refused, field] of [
    [false, undefined],
    [true, 'password'],
    [true, undefined],
  ] as const)
    test.prop([password, sitePath])(
      `goes back to what asked for the proof once the password is right: ${refused ? `refused about ${field ?? 'nothing'}` : 'proved'}`,
      async (secret, next) => {
        freshDom()
        navigation.replace.mockClear()
        const posted = answering(() =>
          refused
            ? allauthRefusal('Wrong.', field)
            : json(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
        )
        render(<ProvePasswordForm next={next} />)
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
        expect(await screen.findByText('Enter your password.')).toBeTruthy()
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: secret } })
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
        await vi.waitFor(() => expect(posted()).toBeDefined())
        expect(await (posted() as Request).json()).toEqual({ password: secret })
        if (refused) expect(await screen.findByText('Wrong.')).toBeTruthy()
        else await vi.waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(next))
      }
    )

  test.prop([address])('emails a link to set a first password, and says where it went', async (email) => {
    freshDom()
    const posted = answering(() => json(200, { status: 200 }))
    render(<ProveSetPasswordByEmail email={email} />)
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link to set a password' }))
    expect(await screen.findByText(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy()
    expect(await (posted() as Request).json()).toEqual({ email })
    expect(screen.queryByRole('button')).toBeNull()
  })
})
