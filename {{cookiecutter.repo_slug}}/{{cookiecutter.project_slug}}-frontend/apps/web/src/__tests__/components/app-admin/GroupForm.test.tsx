import { GroupForm } from '@/components/app-admin/GroupForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

const PERMISSIONS = [
  { name: 'users:grant:rights', label: 'Change what other people may do' },
  { name: 'users:manage:user', label: 'Manage people' },
]
const OPS = { id: 'g1', name: 'ops', permissions: ['users:manage:user'] } as unknown as NonNullable<
  Parameters<typeof GroupForm>[0]['group']
>
const ETAG = '"7"'

const box = (name: RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function answering(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => jsonResponse(status, body))
  globalThis.fetch = fetchMock
  return async () => (fetchMock.mock.calls[0] as unknown as [Request])[0]
}

describe('GroupForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('makes a group of a name and what it gives, then opens it', async () => {
    const sent = answering(201, { ...OPS, id: 'g9' })
    render(<GroupForm permissions={PERMISSIONS} />)

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.getByRole('group', { name: 'What it gives' })).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Name'), 'support')
    await userEvent.click(box(/Manage people/))
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    const request = await sent()
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/v0/groups/')
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()
    expect(await request.json()).toEqual({ name: 'support', permissions: ['users:manage:user'] })
    expect(push).toHaveBeenCalledWith('/groups/g9')
    // Held while the page it went to loads, so a second click makes no second group.
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('changes a group against the version it opened on, then reads the page again', async () => {
    const sent = answering(200, OPS)
    render(<GroupForm group={OPS} etag={ETAG} permissions={PERMISSIONS} />)

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('ops')
    expect(box(/Manage people/).checked).toBe(true)
    await userEvent.click(box(/Change what other people may do/))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const request = await sent()
    expect(request.method).toBe('PATCH')
    expect(new URL(request.url).pathname).toBe('/v0/groups/g1/')
    expect(request.headers.get('If-Match')).toBe('"7"')
    expect(await request.json()).toEqual({ name: 'ops', permissions: ['users:grant:rights', 'users:manage:user'] })
    expect(toast.success).toHaveBeenCalledWith('Saved.')
    expect(refresh).toHaveBeenCalled()
    // It stays on the page, so the form is free again.
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('starts a group whose answer left what it gives unsaid as giving nothing', () => {
    const unsaid = { ...OPS, permissions: undefined }
    render(<GroupForm group={unsaid} etag={ETAG} permissions={PERMISSIONS} />)

    expect(box(/Manage people/).checked).toBe(false)
  })

  it('deletes a group against the version it opened on, then goes back to the list', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock
    render(<GroupForm group={OPS} etag={ETAG} permissions={PERMISSIONS} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('DELETE')
    expect(new URL(request.url).pathname).toBe('/v0/groups/g1/')
    expect(request.headers.get('If-Match')).toBe('"7"')
    expect(toast.success).toHaveBeenCalledWith('Group deleted.')
    expect(push).toHaveBeenCalledWith('/groups')
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows it as it is now when somebody else changed it since the page loaded', async () => {
    answering(412, { detail: 'Changed.', code: 'precondition_failed', current: OPS })
    render(<GroupForm group={OPS} etag={ETAG} permissions={PERMISSIONS} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(refresh).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('reads the page again when a save finds it changed since', async () => {
    answering(412, { detail: 'Changed.', code: 'precondition_failed', current: OPS })
    render(<GroupForm group={OPS} etag={ETAG} permissions={PERMISSIONS} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(refresh).toHaveBeenCalled()
  })

  it('says so in its own words when saving or deleting fails with nothing to show', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<GroupForm group={OPS} etag={ETAG} permissions={PERMISSIONS} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(toast.error).toHaveBeenCalledWith('Could not save the group.')
    expect(toast.error).toHaveBeenCalledWith('Could not delete the group.')
  })
})
