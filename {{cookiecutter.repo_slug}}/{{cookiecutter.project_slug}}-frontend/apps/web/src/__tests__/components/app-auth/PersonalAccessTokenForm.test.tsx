import { PersonalAccessTokenForm, expiresAt } from '@/components/app-auth/PersonalAccessTokenForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const SCOPES = [{ name: 'users:manage:user', label: 'Manage people' }]
const DAY = 24 * 60 * 60 * 1000

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const name = () => screen.getByLabelText('Name') as HTMLInputElement
const expiry = () => screen.getByLabelText('Expires') as HTMLSelectElement

describe('expiresAt', () => {
  it.each([
    ['7', 7],
    ['30', 30],
    ['90', 90],
    ['365', 365],
  ] as const)('counts %s days from now', (choice, days) => {
    expect(expiresAt(choice, 1_000)).toBe(new Date(1_000 + days * DAY).toISOString())
  })

  it('is nothing for a token that never expires', () => {
    expect(expiresAt('never', 1_000)).toBeNull()
  })

  it('counts from the moment it is asked, unless told otherwise', () => {
    vi.useFakeTimers({ now: 5_000 })
    try {
      expect(expiresAt('7')).toBe(new Date(5_000 + 7 * DAY).toISOString())
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('PersonalAccessTokenForm', () => {
  const originalFetch = globalThis.fetch
  const onMade = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('offers each lifetime, thirty days by default, and the scopes it may be given', () => {
    render(<PersonalAccessTokenForm scopes={SCOPES} onMade={onMade} onCancel={onCancel} />)

    expect(expiry().value).toBe('30')
    expect([...expiry().options].map((option) => [option.value, option.textContent])).toEqual([
      ['7', 'In 7 days'],
      ['30', 'In 30 days'],
      ['90', 'In 90 days'],
      ['365', 'In a year'],
      ['never', 'Never'],
    ])
    expect(screen.getByRole('group', { name: 'What it may do' })).toBeTruthy()
    expect(screen.queryByText(/never expires works until you delete it/)).toBeNull()
  })

  it('warns about a token that never expires', async () => {
    render(<PersonalAccessTokenForm scopes={SCOPES} onMade={onMade} onCancel={onCancel} />)

    await userEvent.selectOptions(expiry(), 'never')

    expect(
      screen.getByText(
        'A token that never expires works until you delete it. Pick an expiry unless you have a reason not to.'
      )
    ).toBeTruthy()
  })

  it('asks for a name before sending anything', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    render(<PersonalAccessTokenForm scopes={SCOPES} onMade={onMade} onCancel={onCancel} />)

    await userEvent.type(name(), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Make token' }))

    expect(screen.getByText('Give the token a name.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the name trimmed, what was ticked and when it ends, under an idempotency key', async () => {
    const made = { id: 't1', name: 'CI', scopes: ['users:manage:user'], token: 'pat_x' }
    const fetchMock = vi.fn(async () => jsonResponse(201, made))
    globalThis.fetch = fetchMock
    render(<PersonalAccessTokenForm scopes={SCOPES} onMade={onMade} onCancel={onCancel} />)

    await userEvent.type(name(), ' CI ')
    await userEvent.click(screen.getByRole('checkbox', { name: /Manage people/ }))
    await userEvent.selectOptions(expiry(), '7')
    const before = Date.now()
    await userEvent.click(screen.getByRole('button', { name: 'Make token' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/v0/personal-access-tokens/')
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()
    const body = await request.json()
    expect(body).toEqual({ name: 'CI', scopes: ['users:manage:user'], expires_at: expect.any(String) })
    const ends = new Date(body.expires_at).getTime()
    expect(ends).toBeGreaterThanOrEqual(before + 7 * DAY)
    expect(ends).toBeLessThanOrEqual(Date.now() + 7 * DAY)
    expect(onMade).toHaveBeenCalledWith(made)
  })

  it('sends no end for a token that never expires', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { id: 't1' }))
    globalThis.fetch = fetchMock
    render(<PersonalAccessTokenForm scopes={SCOPES} onMade={onMade} onCancel={onCancel} />)

    await userEvent.type(name(), 'CI')
    await userEvent.selectOptions(expiry(), 'never')
    await userEvent.click(screen.getByRole('button', { name: 'Make token' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(await request.json()).toEqual({ name: 'CI', scopes: [], expires_at: null })
  })

  it("shows the backend's word on what it could not do", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { non_field_errors: ['You can have at most 50 tokens. Delete one you no longer use.'] })
    )
    render(<PersonalAccessTokenForm scopes={SCOPES} onMade={onMade} onCancel={onCancel} />)

    await userEvent.type(name(), 'CI')
    await userEvent.click(screen.getByRole('button', { name: 'Make token' }))

    expect(await screen.findByText('You can have at most 50 tokens. Delete one you no longer use.')).toBeTruthy()
    expect(onMade).not.toHaveBeenCalled()
  })

  it('says so in its own words when making it fails with nothing to show', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<PersonalAccessTokenForm scopes={SCOPES} onMade={onMade} onCancel={onCancel} />)

    await userEvent.type(name(), 'CI')
    await userEvent.click(screen.getByRole('button', { name: 'Make token' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not make the token.'))
  })

  it('is put away without sending anything', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    render(<PersonalAccessTokenForm scopes={SCOPES} onMade={onMade} onCancel={onCancel} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
