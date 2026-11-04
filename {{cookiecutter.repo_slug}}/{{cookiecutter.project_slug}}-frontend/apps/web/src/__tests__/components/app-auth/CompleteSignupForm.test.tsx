import { CompleteSignupForm } from '@/components/app-auth/CompleteSignupForm'

import { NAME_FIELDS, NAME_LABELS, NAME_REQUIRED_MESSAGES, NAME_TABLE, NAME_VALUES } from '@/__tests__/support/names'
import type { NameRequirement } from '@/config/names'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

const requirement = vi.hoisted(() => ({ current: 'username_with_optional_full' as NameRequirement }))
vi.mock('@/config/names', () => ({
  get NAME_REQUIREMENT() {
    return requirement.current
  },
}))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('CompleteSignupForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    push.mockClear()
    requirement.current = 'username_with_optional_full'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('shows the fixed email and prefills the suggested username', () => {
    render(<CompleteSignupForm email="jane@example.com" suggestedUsername="jane" />)

    expect(screen.getByText(/signed in as jane@example\.com/i)).toBeTruthy()
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('jane')
  })

  it('defaults the username field to empty when no suggestion is given', () => {
    render(<CompleteSignupForm email="jane@example.com" />)

    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('')
  })

  it('shows a validation error when the username is empty', async () => {
    const user = userEvent.setup()
    render(<CompleteSignupForm email="jane@example.com" />)

    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

    expect(await screen.findByText('Choose a username.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a validation error when the password is too short', async () => {
    const user = userEvent.setup()
    render(<CompleteSignupForm email="jane@example.com" />)

    await user.type(screen.getByLabelText('Username'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

    expect(await screen.findByText('Use at least 8 characters.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('sends the typed username and password alongside the fixed email', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    globalThis.fetch = fetchMock
    const user = userEvent.setup()
    render(<CompleteSignupForm email="jane@example.com" />)

    await user.type(screen.getByLabelText('Username'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

    await vi.waitFor(() => expect(push).toHaveBeenCalled())
    // openapi-fetch passes the submission as a Request; the CSRF-priming GET is a plain URL string.
    const postCall = fetchMock.mock.calls.find(([request]) => request instanceof Request)
    const body = await (postCall?.[0] as Request).clone().json()
    expect(body).toEqual({
      username: 'jane',
      first_name: '',
      last_name: '',
      password: 'correct-horse-battery',
      email: 'jane@example.com',
    })
  })

  it('redirects home on a 200 (completed a pending login)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const user = userEvent.setup()
    render(<CompleteSignupForm email="jane@example.com" />)

    await user.type(screen.getByLabelText('Username'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

    expect(push).toHaveBeenCalledWith('/')
    // The screen is leaving, so the button stays shut rather than offering a second submit.
    expect(screen.getByRole('button', { name: 'Finish signing up' })).toHaveProperty('disabled', true)
  })

  it('redirects to login on a 401 with no errors array (mandatory verification)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { status: 401, data: { flows: [{ id: 'login' }] }, meta: { is_authenticated: false } })
    )
    const user = userEvent.setup()
    render(<CompleteSignupForm email="jane@example.com" />)

    await user.type(screen.getByLabelText('Username'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

    expect(push).toHaveBeenCalledWith('/auth/login')
  })

  it('shows a server error message when the username is taken', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'unique', param: 'username', message: 'Already taken.' }] })
    )
    const user = userEvent.setup()
    render(<CompleteSignupForm email="jane@example.com" />)

    await user.type(screen.getByLabelText('Username'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

    expect(await screen.findByText('Already taken.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a non-field error that names no particular field', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'throttled', message: 'Try again later.' }] })
    )
    const user = userEvent.setup()
    render(<CompleteSignupForm email="jane@example.com" />)

    await user.type(screen.getByLabelText('Username'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

    expect(await screen.findByText('Try again later.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })
  describe.each(NAME_TABLE)('under %s', (name, offered, required) => {
    beforeEach(() => {
      requirement.current = name
    })

    async function submitted(fetchMock: ReturnType<typeof vi.fn>) {
      await vi.waitFor(() => expect(push).toHaveBeenCalled())
      const postCall = fetchMock.mock.calls.find(([request]) => request instanceof Request)
      return (postCall?.[0] as Request).clone().json()
    }

    it('asks for exactly its names, in its order, before the password', () => {
      const { container } = render(<CompleteSignupForm email="jane@example.com" />)

      expect([...container.querySelectorAll('input')].map((input) => input.name)).toEqual([...offered, 'password'])
      for (const field of offered) expect(screen.getByLabelText(NAME_LABELS[field])).toBeTruthy()
    })

    it('refuses exactly the required names left empty', async () => {
      const user = userEvent.setup()
      render(<CompleteSignupForm email="jane@example.com" />)

      await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
      await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

      await vi.waitFor(() => expect(screen.getByText(NAME_REQUIRED_MESSAGES[required[0]])).toBeTruthy())
      for (const field of NAME_FIELDS) {
        expect(screen.queryByText(NAME_REQUIRED_MESSAGES[field]) !== null).toBe(required.includes(field))
      }
      expect(push).not.toHaveBeenCalled()
    })

    it('sends only its names, the suggested handle only where one is asked for', async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
      )
      globalThis.fetch = fetchMock
      const user = userEvent.setup()
      render(<CompleteSignupForm email="jane@example.com" suggestedUsername="jane" />)

      for (const field of offered) {
        if (field !== 'username') await user.type(screen.getByLabelText(NAME_LABELS[field]), NAME_VALUES[field])
      }
      await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
      await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

      expect(await submitted(fetchMock)).toEqual({
        email: 'jane@example.com',
        password: 'correct-horse-battery',
        ...Object.fromEntries(offered.map((field) => [field, NAME_VALUES[field]])),
      })
    })
  })
})
