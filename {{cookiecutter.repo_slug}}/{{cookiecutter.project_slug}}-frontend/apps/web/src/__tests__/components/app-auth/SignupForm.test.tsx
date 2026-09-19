import { SignupForm } from '@/components/app-auth/SignupForm'

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    push.mockClear()
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
    // A real click would let the browser's own type="email" constraint validation intercept the
    // submit event before React ever sees it - firing "submit" directly is how a value that
    // reaches our Zod check despite that (e.g. a paste) would actually behave.
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

    expect(await screen.findByText('Could not sign you up.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a generic error on a 401 with no data key at all', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(401, { status: 401, errors: [{ message: 'Unauthorized.' }] }))
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    expect(await screen.findByText('Unauthorized.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a generic error on a 401 whose data has no flows key', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { status: 401, data: {}, meta: { is_authenticated: false } })
    )
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    expect(await screen.findByText('Could not sign you up.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('does not treat a 401 with no pending verify_email flow as success', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { status: 401, data: { flows: [{ id: 'login' }] }, meta: { is_authenticated: false } })
    )
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    expect(await screen.findByText('Could not sign you up.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('falls back to a generic error message when the response has no errors array', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const user = userEvent.setup()
    render(<SignupForm />)

    await fillAndSubmit(user)

    expect(await screen.findByText('Could not sign you up.')).toBeTruthy()
  })
})
