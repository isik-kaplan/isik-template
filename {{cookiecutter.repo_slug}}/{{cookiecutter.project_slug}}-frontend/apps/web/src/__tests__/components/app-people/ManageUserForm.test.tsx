import { ManageUserForm } from '@/components/app-people/ManageUserForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const PERMISSIONS = [
  { name: 'users:grant:rights', label: 'Change what other people may do' },
  { name: 'users:manage:user', label: 'Manage people' },
]
const BOB = {
  id: 'u1',
  username: 'bob',
  is_active: true,
  is_staff: false,
  is_superuser: false,
  permissions: ['users:manage:user'],
} as unknown as Parameters<typeof ManageUserForm>[0]['user']

// The read's ETag header, which the page hands the form beside the user.
const ETAG = '"7"'

// An answer that left its access unsaid.
const EVE = { id: 'u2', username: 'eve' } as typeof BOB
const STAFF_SUPERUSER = { ...BOB, is_staff: true, is_superuser: true, is_active: false }

const box = (name: RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('ManageUserForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('starts from their access and what they were granted', () => {
    render(<ManageUserForm user={BOB} etag={ETAG} permissions={PERMISSIONS} />)

    expect(screen.getByRole('group', { name: 'Access' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Permissions' })).toBeTruthy()
    expect(box(/May sign in/).checked).toBe(true)
    expect(box(/^Staff/).checked).toBe(false)
    expect(box(/^Superuser/).checked).toBe(false)
    expect(box(/Manage people/).checked).toBe(true)
    expect(box(/Change what other people may do/).checked).toBe(false)
  })

  it('reads an account whose answer left its access unsaid as an ordinary one', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, BOB))
    globalThis.fetch = fetchMock
    render(<ManageUserForm user={EVE} etag={ETAG} permissions={PERMISSIONS} />)

    expect(box(/May sign in/).checked).toBe(true)
    expect(box(/^Staff/).checked).toBe(false)
    expect(box(/^Superuser/).checked).toBe(false)
    expect(box(/Manage people/).checked).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(await request.json()).toEqual({ is_active: true, is_staff: false, is_superuser: false, permissions: [] })
  })

  it('starts a staff superuser as one', () => {
    render(<ManageUserForm user={STAFF_SUPERUSER} etag={ETAG} permissions={PERMISSIONS} />)

    expect(box(/May sign in/).checked).toBe(false)
    expect(box(/^Staff/).checked).toBe(true)
    expect(box(/^Superuser/).checked).toBe(true)
  })

  it('saves every flag and the permissions together, then reads the page again', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, BOB))
    globalThis.fetch = fetchMock
    render(<ManageUserForm user={BOB} etag={ETAG} permissions={PERMISSIONS} />)

    await userEvent.click(box(/May sign in/))
    await userEvent.click(box(/^Staff/))
    await userEvent.click(box(/^Superuser/))
    await userEvent.click(box(/Change what other people may do/))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('PATCH')
    expect(new URL(request.url).pathname).toBe('/v0/users/u1/')
    // Against the version this page showed, so a change made since is not overwritten.
    expect(request.headers.get('If-Match')).toBe('"7"')
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()
    expect(await request.json()).toEqual({
      is_active: false,
      is_staff: true,
      is_superuser: true,
      permissions: ['users:grant:rights', 'users:manage:user'],
    })
    expect(toast.success).toHaveBeenCalledWith('Saved.')
    expect(refresh).toHaveBeenCalled()
  })

  it('shows them as they are now when somebody else changed them since the page loaded', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(412, { detail: 'Changed.', code: 'precondition_failed', current: BOB })
    )
    render(<ManageUserForm user={BOB} etag={ETAG} permissions={PERMISSIONS} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(toast.error).toHaveBeenCalledWith('Someone else changed this since you opened it. Review their changes.')
    expect(toast.success).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it('says why the backend would not let it be saved', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(403, { detail: 'You cannot change what other people may do.' }))
    render(<ManageUserForm user={BOB} etag={ETAG} permissions={PERMISSIONS} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(toast.error).toHaveBeenCalledWith('You cannot change what other people may do.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('says so in its own words when saving fails with nothing to show', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<ManageUserForm user={BOB} etag={ETAG} permissions={PERMISSIONS} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(toast.error).toHaveBeenCalledWith('Could not save their account.')
  })

  it('holds the button while saving', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}))
    render(<ManageUserForm user={BOB} etag={ETAG} permissions={PERMISSIONS} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
