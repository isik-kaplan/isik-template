import { CompleteSignupForm } from '@/components/app-auth/CompleteSignupForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('CompleteSignupForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    push.mockClear()
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
    // openapi-fetch passes a real Request (body already attached) as the first arg, not a
    // second-arg { body } option - the CSRF-priming GET is a plain URL string, so filtering
    // on "first arg is a Request" finds only the actual submission.
    const postCall = fetchMock.mock.calls.find(([request]) => request instanceof Request)
    const body = await (postCall?.[0] as Request).clone().json()
    expect(body).toEqual({ username: 'jane', password: 'correct-horse-battery', email: 'jane@example.com' })
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
})
