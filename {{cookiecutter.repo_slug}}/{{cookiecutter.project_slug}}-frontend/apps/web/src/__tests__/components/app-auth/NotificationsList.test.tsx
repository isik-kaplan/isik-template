import { NotificationsList, messageOf } from '@/components/app-auth/NotificationsList'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

type Props = Parameters<typeof NotificationsList>[0]
type Item = Props['initialItems'][number]

const AT = '2001-01-02T03:04:05Z'

function item(fields: Partial<Item>): Item {
  return {
    id: 'n1',
    kind: 'token_created',
    variant: null,
    subject_label: null,
    subject_id: null,
    payload: { data: { name: 'CI' } },
    title: null,
    message: 'A personal access token named "CI" was created.',
    read_at: null,
    created_at: AT,
    actor: null,
    ...fields,
  } as Item
}

type Kind = Props['initialKinds'][number]

function kind(fields: Partial<Kind>): Kind {
  return {
    kind: 'account_changed',
    label: 'Changes to your account, in your inbox',
    description: null,
    policy: 'default_on',
    variants: [],
    channels: ['inbox'],
    may_change: true,
    enabled: true,
    enabled_variants: {},
    forced: false,
    forced_enabled: null,
    forced_variants: [],
    forced_reason: null,
    ...fields,
  } as Kind
}

const ACCOUNT = kind({})
const REVIEWS = kind({ kind: 'application_reviewed', label: 'Your applications being approved or withdrawn' })

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function moment(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const t = ((key: string, values?: Record<string, string>) => (values?.name ? `${key}(${values.name})` : key)) as never

describe('messageOf', () => {
  it('says what the backend rendered for it', () => {
    expect(messageOf(item({}), t)).toBe('A personal access token named "CI" was created.')
  })

  it('says something changed when the backend had nothing to say', () => {
    expect(messageOf(item({ message: null }), t)).toBe('auth:notificationSomethingChanged')
  })
})

describe('NotificationsList', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('says when there is nothing, and offers no settings when nothing can be turned off', () => {
    render(<NotificationsList initialItems={[]} initialKinds={[]} />)

    expect(screen.getByText('Nothing to tell you yet.')).toBeTruthy()
    expect(screen.queryByText('Mark all read')).toBeNull()
    expect(screen.queryByText("What you're told")).toBeNull()
  })

  it('shows each notification, who acted, and the unread ones bold with a way to mark them read', () => {
    render(
      <NotificationsList
        initialItems={[
          item({ id: 'a', actor: 'self' }),
          item({
            id: 'b',
            kind: 'token_revoked',
            message: 'The personal access token named "CI" was revoked.',
            actor: 'staff',
            read_at: AT,
          }),
          item({ id: 'c', kind: 'signed_out_by_policy', message: 'Signed out.', actor: 'other', read_at: AT }),
          item({ id: 'd', kind: 'account_changed', message: null, actor: null, read_at: AT, payload: {} }),
        ]}
        initialKinds={[]}
      />
    )

    const created = screen.getByText('A personal access token named "CI" was created.')
    expect(created.className).toContain('font-semibold')
    expect(screen.getByText(`${moment(AT)} · By you`)).toBeTruthy()
    expect(screen.getByText('The personal access token named "CI" was revoked.').className).not.toContain(
      'font-semibold'
    )
    expect(screen.getByText(`${moment(AT)} · By a staff member`)).toBeTruthy()
    expect(screen.getByText(`${moment(AT)} · By someone else`)).toBeTruthy()
    expect(screen.getByText(moment(AT))).toBeTruthy()
    expect(screen.getAllByText('Mark read')).toHaveLength(1)
    expect(screen.getByText('Mark all read')).toBeTruthy()
  })

  it('marks one read with the time the server gave', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, item({ read_at: AT })))
    globalThis.fetch = fetchMock as never
    render(<NotificationsList initialItems={[item({})]} initialKinds={[]} />)

    await userEvent.click(screen.getByText('Mark read'))

    expect(screen.queryByText('Mark read')).toBeNull()
    expect(screen.queryByText('Mark all read')).toBeNull()
    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.url).toContain('/v0/notifications/inbox/n1/read/')
  })

  it('marks one read now when the server gave no time', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, item({ read_at: null }))) as never
    render(<NotificationsList initialItems={[item({})]} initialKinds={[]} />)

    await userEvent.click(screen.getByText('Mark read'))

    expect(screen.queryByText('Mark read')).toBeNull()
  })

  it('says so when marking one read fails, and leaves it unread', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(500, {})) as never
    render(<NotificationsList initialItems={[item({})]} initialKinds={[]} />)

    await userEvent.click(screen.getByText('Mark read'))

    expect(toast.error).toHaveBeenCalledWith("Couldn't mark it read. Try again.")
    expect(screen.getByText('Mark read')).toBeTruthy()
  })

  it('marks every unread one read at once, and only those', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { marked: 2 })) as never
    render(
      <NotificationsList
        initialItems={[item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c', kind: 'token_revoked', read_at: AT })]}
        initialKinds={[]}
      />
    )

    await userEvent.click(screen.getByText('Mark all read'))

    expect(screen.queryByText('Mark read')).toBeNull()
    expect(screen.queryByText('Mark all read')).toBeNull()
  })

  it('says so when marking them all read fails', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(500, {})) as never
    render(<NotificationsList initialItems={[item({})]} initialKinds={[]} />)

    await userEvent.click(screen.getByText('Mark all read'))

    expect(toast.error).toHaveBeenCalledWith("Couldn't mark it read. Try again.")
    expect(screen.getByText('Mark all read')).toBeTruthy()
  })

  it('shows each kind as what the person gets now', () => {
    render(<NotificationsList initialItems={[]} initialKinds={[ACCOUNT, { ...REVIEWS, enabled: false }]} />)

    expect((screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Your applications being approved or withdrawn') as HTMLInputElement).checked).toBe(
      false
    )
  })

  it('turns a kind off, keeping the choice the server answered with', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { id: 's1', kind: 'account_changed', variant: null, enabled: false })
    )
    globalThis.fetch = fetchMock as never
    render(<NotificationsList initialItems={[]} initialKinds={[ACCOUNT]} />)

    await userEvent.click(screen.getByLabelText('Changes to your account, in your inbox'))

    expect((screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement).checked).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Saved.')
    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(await request.json()).toEqual({ kind: 'account_changed', enabled: false })
  })

  it('says so when a choice could not be saved, and keeps the box as it was', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, {})) as never
    render(<NotificationsList initialItems={[]} initialKinds={[ACCOUNT]} />)

    await userEvent.click(screen.getByLabelText('Changes to your account, in your inbox'))

    expect(toast.error).toHaveBeenCalledWith("Couldn't save that. Try again.")
    expect((screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement).checked).toBe(true)
  })

  it('names the inbox and, when something may be turned off, what is chosen there', () => {
    render(<NotificationsList initialItems={[]} initialKinds={[ACCOUNT]} />)

    expect(screen.getByText('Notifications')).toBeTruthy()
    expect(screen.getByText("What you're told")).toBeTruthy()
    expect(screen.getByText('Security notices always reach you. These you can turn off.')).toBeTruthy()
  })

  it.each([
    ['self', 'By you'],
    ['staff', 'By a staff member'],
    ['other', 'By someone else'],
  ])('says a notification %s acted on was by %s', (actor, words) => {
    render(<NotificationsList initialItems={[item({ actor: actor as Item['actor'] })]} initialKinds={[]} />)

    expect(screen.getByText(`${moment(AT)} · ${words}`)).toBeTruthy()
  })

  it('names nobody when nobody acted', () => {
    render(<NotificationsList initialItems={[item({ actor: null })]} initialKinds={[]} />)

    expect(screen.getByText(moment(AT))).toBeTruthy()
  })

  it('shows a read notification in plain text', () => {
    render(<NotificationsList initialItems={[item({ read_at: AT })]} initialKinds={[]} />)

    expect(screen.getByText('A personal access token named "CI" was created.').className).toBe('text-sm')
  })

  it('holds each button down while its own request is on its way', async () => {
    let answer: (response: Response) => void = () => undefined
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))) as never
    render(<NotificationsList initialItems={[item({ id: 'a' }), item({ id: 'b' })]} initialKinds={[ACCOUNT]} />)
    const [first, second] = screen.getAllByText('Mark read') as HTMLButtonElement[]

    await userEvent.click(first)
    expect(first.disabled).toBe(true)
    expect(second.disabled).toBe(false)
    expect((screen.getByText('Mark all read') as HTMLButtonElement).disabled).toBe(false)
    answer(jsonResponse(200, item({ id: 'a', read_at: AT })))
    await vi.waitFor(() => expect(screen.getAllByText('Mark read')).toHaveLength(1))

    await userEvent.click(screen.getByText('Mark all read'))
    expect((screen.getByText('Mark all read') as HTMLButtonElement).disabled).toBe(true)
    answer(jsonResponse(200, { marked: 1 }))
    await vi.waitFor(() => expect(screen.queryByText('Mark all read')).toBeNull())

    const box = screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement
    await userEvent.click(box)
    expect(box.disabled).toBe(true)
    answer(jsonResponse(201, { id: 's1', kind: 'account_changed', variant: null, enabled: false }))
    await vi.waitFor(() => expect(box.disabled).toBe(false))
  })

  it('turns on only the kind chosen', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(201, { id: 's1', kind: 'account_changed', variant: null, enabled: true })
    ) as never
    render(
      <NotificationsList
        initialItems={[]}
        initialKinds={[
          { ...ACCOUNT, enabled: false },
          { ...REVIEWS, enabled: false },
        ]}
      />
    )

    await userEvent.click(screen.getByLabelText('Changes to your account, in your inbox'))

    expect((screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Your applications being approved or withdrawn') as HTMLInputElement).checked).toBe(
      false
    )
  })

  it('shows a kind staff decided as it is now, locked, with the reason when it may be read', () => {
    render(
      <NotificationsList
        initialItems={[]}
        initialKinds={[
          kind({
            may_change: false,
            forced: true,
            enabled: false,
            forced_enabled: false,
            forced_reason: 'Paused during the investigation.',
          }),
          kind({ kind: 'application_reviewed', label: null, may_change: false, forced: true, forced_enabled: true }),
        ]}
      />
    )

    const paused = screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement
    expect(paused.disabled).toBe(true)
    expect(paused.checked).toBe(false)
    expect((screen.getByLabelText('application_reviewed') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('Decided for you by staff: Paused during the investigation.')).toBeTruthy()
    expect(screen.getByText('Decided for you by staff.')).toBeTruthy()
  })

  it('leaves out a kind nobody may change and staff did not decide', () => {
    render(
      <NotificationsList
        initialItems={[]}
        initialKinds={[kind({ kind: 'token_created', label: 'New tokens', may_change: false })]}
      />
    )

    expect(screen.queryByText('New tokens')).toBeNull()
    expect(screen.queryByText("What you're told")).toBeNull()
  })

  it('names a kind by its name when the backend gave it no label', () => {
    render(<NotificationsList initialItems={[]} initialKinds={[kind({ label: null })]} />)

    expect(screen.getByLabelText('account_changed')).toBeTruthy()
  })
})
