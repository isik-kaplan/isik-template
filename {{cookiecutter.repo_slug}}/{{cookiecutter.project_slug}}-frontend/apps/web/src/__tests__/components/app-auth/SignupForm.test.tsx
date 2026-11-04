import { SignupForm } from '@/components/app-auth/SignupForm'

import {
  NAME_AUTOCOMPLETE,
  NAME_FIELDS,
  NAME_LABELS,
  NAME_REQUIRED_MESSAGES,
  NAME_TABLE,
  NAME_VALUES,
} from '@/__tests__/support/names'
import type { NameRequirement } from '@/config/names'

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const requirement = vi.hoisted(() => ({ current: 'username_with_optional_full' as NameRequirement }))
vi.mock('@/config/names', () => ({
  get NAME_REQUIREMENT() {
    return requirement.current
  },
}))

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Username'), 'jane')
  await user.type(screen.getByLabelText('Email'), 'jane@example.com')
  await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
  await user.click(screen.getByRole('button', { name: 'Sign up' }))
}

describe('SignupForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
    push.mockClear()
    requirement.current = 'username_with_optional_full'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('starts every field empty', () => {
    render(<SignupForm />)

    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
  })

  it('shows the exact validation message for an empty username, and no other field error', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Email'), 'jane@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Choose a username.')).toBeTruthy()
    expect(screen.queryByText('Enter a valid email address.')).toBeNull()
    expect(screen.queryByText('Use at least 8 characters.')).toBeNull()
  })

  it('shows the exact validation message for an invalid email, and no other field error', async () => {
    const user = userEvent.setup()
    const { container } = render(<SignupForm />)

    await user.type(screen.getByLabelText('Username'), 'jane')
    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    // Submitted directly: a click would let the browser's type="email" validation intercept it.
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
    expect(screen.queryByText('Choose a username.')).toBeNull()
    expect(screen.queryByText('Use at least 8 characters.')).toBeNull()
  })

  it('shows the exact validation message for a too-short password, and no other field error', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Username'), 'jane')
    await user.type(screen.getByLabelText('Email'), 'jane@example.com')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Use at least 8 characters.')).toBeTruthy()
    expect(screen.queryByText('Choose a username.')).toBeNull()
    expect(screen.queryByText('Enter a valid email address.')).toBeNull()
  })

  it('redirects to signup-email-sent on a plain 2xx success', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    expect(push).toHaveBeenCalledWith('/auth/signup-email-sent')
    // The screen is leaving, so the button stays shut rather than offering a second submit.
    expect(screen.getByRole('button', { name: 'Sign up' })).toHaveProperty('disabled', true)
  })

  it('treats a 401 pending verify_email flow as success', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, {
        status: 401,
        data: { flows: [{ id: 'login' }, { id: 'verify_email', is_pending: true }] },
        meta: { is_authenticated: false },
      })
    )
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    expect(push).toHaveBeenCalledWith('/auth/signup-email-sent')
  })

  it('shows a server error message when signup fails outright', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'unique', param: 'email', message: 'Already taken.' }] })
    )
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    expect(await screen.findByText('Already taken.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('does not treat a matching flow as success on a status other than 401', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, {
        status: 400,
        data: { flows: [{ id: 'verify_email', is_pending: true }] },
        meta: { is_authenticated: false },
      })
    )
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not sign you up.'))
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a generic error on a 401 with no data key at all', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(401, { status: 401, errors: [{ message: 'Unauthorized.' }] }))
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Unauthorized.'))
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a generic error on a 401 whose data has no flows key', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { status: 401, data: {}, meta: { is_authenticated: false } })
    )
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not sign you up.'))
    expect(push).not.toHaveBeenCalled()
  })

  it('does not treat a 401 with no pending verify_email flow as success', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { status: 401, data: { flows: [{ id: 'login' }] }, meta: { is_authenticated: false } })
    )
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not sign you up.'))
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a refusal that names no field beneath the form', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'too_many', message: 'Slow down.' }] })
    )
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    expect(await screen.findByText('Slow down.')).toBeTruthy()
  })

  it('falls back to a generic error message when the response has no errors array', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not sign you up.'))
  })
  describe.each(NAME_TABLE)('under %s', (name, offered, required) => {
    beforeEach(() => {
      requirement.current = name
    })

    it('asks for exactly its names, in its order, before the email and password', () => {
      const { container } = render(<SignupForm />)

      const inputs = [...container.querySelectorAll('input')]
      expect(inputs.map((input) => input.name)).toEqual([...offered, 'email', 'password'])
      for (const field of offered) {
        const input = screen.getByLabelText(NAME_LABELS[field]) as HTMLInputElement
        expect([input.name, input.value, input.autocomplete]).toEqual([field, '', NAME_AUTOCOMPLETE[field]])
      }
    })

    it('refuses exactly the required names left empty', async () => {
      const user = userEvent.setup()
      render(<SignupForm />)

      await user.type(screen.getByLabelText('Email'), 'jane@example.com')
      await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
      await user.click(screen.getByRole('button', { name: 'Sign up' }))

      await vi.waitFor(() => expect(screen.getByText(NAME_REQUIRED_MESSAGES[required[0]])).toBeTruthy())
      for (const field of NAME_FIELDS) {
        expect(screen.queryByText(NAME_REQUIRED_MESSAGES[field]) !== null).toBe(required.includes(field))
      }
    })

    it('refuses a required name of only spaces', async () => {
      const user = userEvent.setup()
      render(<SignupForm />)

      await user.type(screen.getByLabelText(NAME_LABELS[required[0]]), '   ')
      await user.click(screen.getByRole('button', { name: 'Sign up' }))

      expect(await screen.findByText(NAME_REQUIRED_MESSAGES[required[0]])).toBeTruthy()
    })

    it('sends only its names, with the email and password', async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
      )
      globalThis.fetch = fetchMock
      const user = userEvent.setup()
      render(<SignupForm />)

      for (const field of offered) await user.type(screen.getByLabelText(NAME_LABELS[field]), NAME_VALUES[field])
      await user.type(screen.getByLabelText('Email'), 'jane@example.com')
      await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
      await user.click(screen.getByRole('button', { name: 'Sign up' }))

      await vi.waitFor(() => expect(push).toHaveBeenCalled())
      const postCall = fetchMock.mock.calls.find(([request]) => request instanceof Request)
      const body = await (postCall?.[0] as Request).clone().json()
      expect(body).toEqual({
        email: 'jane@example.com',
        password: 'correct-horse-battery',
        ...Object.fromEntries(offered.map((field) => [field, NAME_VALUES[field]])),
      })
    })
  })

  it('refuses a name longer than the column', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'a'.repeat(151) } })
    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Use at most 150 characters.')).toBeTruthy()
  })
})
