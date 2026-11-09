import { CompleteSignupForm } from '@/components/app-auth/CompleteSignupForm'
import { LoginForm } from '@/components/app-auth/LoginForm'
import { SignupForm } from '@/components/app-auth/SignupForm'

import type { NameRequirement } from '@/config/names'
import type { Phone } from '@/config/phone'
import { handleLogsIn, isNameRequired, offeredNames } from '@/lib/names'

import { about, address, allauthRefusal, sitePath } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { calls, navigation } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

// Drawn per example: what a project could have been generated with, rather than what this one was.
const project = vi.hoisted(() => ({
  requirement: 'username_with_optional_full' as NameRequirement,
  phone: 'none' as Phone,
}))
vi.mock('@/config/names', () => ({
  get NAME_REQUIREMENT() {
    return project.requirement
  },
}))
vi.mock('@/config/phone', () => ({
  get PHONE() {
    return project.phone
  },
}))

const REQUIREMENTS: NameRequirement[] = [
  'username_with_optional_full',
  'full_only',
  'full_and_username',
  'full_with_optional_username',
  'username_only',
]
const requirement = fc.constantFrom(...REQUIREMENTS)
const phoneOption = fc.constantFrom<Phone>('none', 'optional', 'required')
const LABELS = { first_name: 'First name', last_name: 'Last name', username: 'Username' } as const
const name = fc.stringMatching(/^[A-Za-z][a-z]{1,10}$/)
const number = fc.stringMatching(/^\+[1-9]\d{6,13}$/)
const password = fc.stringMatching(/^[A-Za-z0-9]{8,20}$/)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const pending = (id: string) =>
  json(401, { status: 401, data: { flows: [{ id, is_pending: true }] }, meta: { is_authenticated: false } })

function answering(response: () => Response) {
  const sent = vi.fn(async () => response())
  vi.stubGlobal('fetch', sent)
  const posted = () =>
    calls(sent)
      .map(([input]) => input)
      .find((input) => input instanceof Request && input.method === 'POST') as Request | undefined
  return { sent, posted }
}

const OUTCOMES = ['signed in', 'verify_email', 'verify_phone', 'refused', 'refused about nothing']
const responseFor = (what: string, field?: string) => () => {
  if (what === 'signed in') return json(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
  if (what === 'refused') return allauthRefusal('Already taken.', field)
  if (what === 'refused about nothing') return allauthRefusal('Already taken.', undefined)
  return pending(what)
}

describe('signing up', () => {
  // One property per answer: drawn among five, some run would miss one.
  for (const what of OUTCOMES)
    test.prop([
      requirement,
      phoneOption,
      fc.record({ first_name: name, last_name: name, username: name }),
      address,
      fc.option(number, { nil: '' }),
      password,
      about('email', 'password'),
    ])(
      `asks for exactly the names and number this project asks for, sends only those, and goes where the answer says: ${what}`,
      async (req, phone, names, email, given, secret, field) => {
        freshDom()
        project.requirement = req
        project.phone = phone
        navigation.push.mockClear()
        const { posted } = answering(responseFor(what, field))
        const { container } = render(<SignupForm />)

        const shown = offeredNames(req)
        const expected = [...shown, 'email', ...(phone === 'none' ? [] : ['phone']), 'password']
        expect([...container.querySelectorAll('input')].map((input) => input.name)).toEqual(expected)

        for (const field of shown)
          fireEvent.change(screen.getByLabelText(LABELS[field]), { target: { value: names[field] } })
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
        if (phone !== 'none')
          fireEvent.change(container.querySelector('input[name=phone]') as HTMLInputElement, {
            target: { value: given },
          })
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: secret } })
        fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))

        if (phone === 'required' && !given) {
          await new Promise((resolve) => setTimeout(resolve, 0))
          expect(posted()).toBeUndefined()
          return
        }
        await vi.waitFor(() => expect(posted()).toBeDefined())
        const body = await (posted() as Request).json()
        expect(body).toEqual({
          email,
          password: secret,
          ...Object.fromEntries(shown.map((field) => [field, names[field]])),
          ...(phone !== 'none' && given ? { phone: given } : {}),
        })
        if (what.startsWith('refused')) expect(await screen.findByText('Already taken.')).toBeTruthy()
        else
          await vi.waitFor(() =>
            expect(navigation.push).toHaveBeenCalledWith(
              what === 'verify_phone' ? '/auth/verify-phone' : '/auth/signup-email-sent'
            )
          )
      }
    )

  test.prop([requirement, phoneOption])(
    'refuses exactly the required names left empty, and sends nothing',
    async (req, phone) => {
      freshDom()
      project.requirement = req
      project.phone = phone
      const { posted } = answering(() => json(200, {}))
      render(<SignupForm />)
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
      // Waited for, not slept on: under load the refusals render a little after the click.
      await vi.waitFor(() => {
        for (const field of offeredNames(req)) {
          const box = screen.getByLabelText(LABELS[field])
          const refused = /Enter your|Choose a/.test(box.parentElement?.textContent ?? '')
          expect(refused).toBe(isNameRequired(field, req))
        }
      })
      expect(posted()).toBeUndefined()
    }
  )
})

describe('logging in', () => {
  const identifier = fc.oneof(address, name, number)

  // One property per answer: drawn among six, some run would miss one.
  for (const what of ['signed in', 'already', 'verify_email', 'verify_phone', 'mfa', 'refused'])
    test.prop([
      requirement,
      // Required drawn half the time: only there does a typed number sign in as one.
      fc.oneof(fc.constant<Phone>('required'), phoneOption),
      identifier,
      password,
      sitePath,
    ])(
      `sends what was typed as the identifier this project signs in with, and goes where the answer says: ${what}`,
      async (req, phone, login, secret, next) => {
        freshDom()
        project.requirement = req
        project.phone = phone
        navigation.push.mockClear()
        navigation.refresh.mockClear()
        const answers: Record<string, () => Response> = {
          'signed in': () => json(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } }),
          already: () => json(409, { status: 409 }),
          mfa: () =>
            json(401, {
              status: 401,
              data: { flows: [{ id: 'mfa_authenticate', is_pending: true, types: ['totp'] }] },
              meta: { is_authenticated: false },
            }),
          refused: () => json(400, { status: 400, errors: [{ message: 'Wrong password.' }] }),
        }
        const response = () => (answers[what] ?? (() => pending(what)))()
        const { posted } = answering(response)
        render(<LoginForm redirectTo={next} />)

        const field = screen.getByRole('textbox') as HTMLInputElement
        fireEvent.change(field, { target: { value: login } })
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: secret } })
        fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
        await vi.waitFor(() => expect(posted()).toBeDefined())

        const typed = login.includes('@') ? 'email' : 'username'
        const key = phone === 'required' && login.startsWith('+') ? 'phone' : typed
        expect(await (posted() as Request).json()).toEqual({ [key]: login, password: secret })
        const destinations: Record<string, string> = {
          'signed in': next,
          already: next,
          verify_email: '/auth/verify-email-required',
          verify_phone: `/auth/verify-phone?next=${encodeURIComponent(next)}`,
          mfa: `/auth/two-factor?next=${encodeURIComponent(next)}`,
        }
        if (what === 'refused') {
          // Not about a field, so it is said under the form rather than beside one.
          expect(await screen.findByText('Wrong password.')).toBeTruthy()
          expect(navigation.push).not.toHaveBeenCalled()
        } else await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(destinations[what]))
      }
    )

  test.prop([requirement, phoneOption])(
    'names only the ways in this project has, and says which when nothing is typed',
    async (req, phone) => {
      freshDom()
      project.requirement = req
      project.phone = phone
      render(<LoginForm />)
      const byHandle = handleLogsIn(req)
      const byPhone = phone === 'required'
      const label = {
        'true,true': 'Username, email or phone number',
        'true,false': 'Username or email',
        'false,true': 'Email or phone number',
        'false,false': 'Email',
      }[`${byHandle},${byPhone}`] as string
      expect(screen.getByLabelText(label)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
      expect(
        await screen.findByText(
          {
            'true,true': 'Enter your username, email or phone number.',
            'true,false': 'Enter your username or email.',
            'false,true': 'Enter your email or phone number.',
            'false,false': 'Enter your email.',
          }[`${byHandle},${byPhone}`] as string
        )
      ).toBeTruthy()
    }
  )
})

describe('finishing a signup through a provider', () => {
  // One property per answer: drawn among six, some run would miss one.
  for (const outcome of [
    'signed in',
    'created',
    'verify_phone',
    'refused about the password',
    'refused about the number',
    'refused about nothing',
  ])
    test.prop([
      requirement,
      phoneOption,
      address,
      fc.option(name, { nil: undefined }),
      fc.record({ first_name: name, last_name: name }),
      fc.option(number, { nil: '' }),
      password,
    ])(
      `asks for this project's names and number, keeps the provider's address, and goes where the answer says: ${outcome}`,
      async (req, phone, email, suggested, names, given, secret) => {
        const what = outcome.startsWith('refused') ? 'refused' : outcome
        const drawn = { 'refused about the password': 'password', 'refused about the number': 'phone' }[
          outcome as string
        ]
        // A refusal about the number only where there is a number field to show it under.
        const field = drawn === 'phone' && phone === 'none' ? undefined : drawn
        freshDom()
        project.requirement = req
        project.phone = phone
        navigation.push.mockClear()
        const answers: Record<string, () => Response> = {
          'signed in': () => json(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } }),
          created: () =>
            json(401, { status: 401, data: { flows: [{ id: 'login' }] }, meta: { is_authenticated: false } }),
          refused: () => allauthRefusal('Taken.', field),
        }
        const response = () => (answers[what] ?? (() => pending('verify_phone')))()
        const { posted } = answering(response)
        const { container } = render(<CompleteSignupForm email={email} suggestedUsername={suggested} />)
        expect(screen.getByText(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy()

        const shown = offeredNames(req)
        if (shown.includes('username'))
          expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe(suggested ?? '')
        const values: Record<string, string> = { ...names, username: suggested || 'handle' }
        for (const field of shown)
          fireEvent.change(screen.getByLabelText(LABELS[field]), { target: { value: values[field] } })
        if (phone !== 'none')
          fireEvent.change(container.querySelector('input[name=phone]') as HTMLInputElement, {
            target: { value: given },
          })
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: secret } })
        fireEvent.click(screen.getByRole('button', { name: 'Finish signing up' }))

        if (phone === 'required' && !given) {
          await new Promise((resolve) => setTimeout(resolve, 0))
          expect(posted()).toBeUndefined()
          return
        }
        await vi.waitFor(() => expect(posted()).toBeDefined())
        expect(await (posted() as Request).json()).toEqual({
          email,
          password: secret,
          ...Object.fromEntries(shown.map((field) => [field, values[field]])),
          ...(phone !== 'none' && given ? { phone: given } : {}),
        })
        const destinations: Record<string, string> = {
          'signed in': '/',
          created: '/auth/login',
          verify_phone: '/auth/verify-phone',
        }
        if (what === 'refused') expect(await screen.findByText('Taken.')).toBeTruthy()
        else await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(destinations[what]))
      }
    )
})
