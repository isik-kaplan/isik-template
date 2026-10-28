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
    read_at: null,
    created_at: AT,
    actor: null,
    ...fields,
  } as Item
}

const ACCOUNT = { kind: 'account_changed', policy: 'default_on', variants: [] } as unknown as Props['kinds'][number]
const REVIEWS = {
  kind: 'application_reviewed',
  policy: 'default_on',
  variants: [],
} as unknown as Props['kinds'][number]

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function moment(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const t = ((key: string, values?: Record<string, string>) => (values?.name ? `${key}(${values.name})` : key)) as never

describe('messageOf', () => {
  it.each([
    ['token_created', null, 'auth:notificationTokenCreated(CI)'],
    ['token_revoked', null, 'auth:notificationTokenRevoked(CI)'],
    ['application_reviewed', 'approved', 'auth:notificationApplicationApproved(CI)'],
    ['application_reviewed', 'withdrawn', 'auth:notificationApplicationWithdrawn(CI)'],
    ['signed_out_by_policy', null, 'auth:notificationSignedOutByPolicy'],
    ['account_changed', 'password_changed', 'auth:notificationPasswordChanged'],
    ['account_changed', 'password_set', 'auth:notificationPasswordSet'],
    ['account_changed', 'email_changed', 'auth:notificationEmailChanged'],
    ['account_changed', 'email_deleted', 'auth:notificationEmailDeleted'],
    ['account_changed', 'totp_activated', 'auth:notificationTotpActivated'],
    ['account_changed', 'totp_deactivated', 'auth:notificationTotpDeactivated'],
    ['account_changed', 'recovery_codes_generated', 'auth:notificationRecoveryCodesGenerated'],
    ['account_changed', 'webauthn_added', 'auth:notificationWebauthnAdded'],
    ['account_changed', 'webauthn_removed', 'auth:notificationWebauthnRemoved'],
    ['account_changed', 'account_connected', 'auth:notificationAccountConnected'],
    ['account_changed', 'account_disconnected', 'auth:notificationAccountDisconnected'],
    ['account_changed', 'something_new', 'auth:notificationSomethingChanged'],
    ['a_kind_added_later', null, 'auth:notificationSomethingChanged'],
  ])('says what %s (%s) means', (kind, variant, expected) => {
    expect(messageOf(item({ kind, variant }), t)).toBe(expected)
  })

  it('names nothing when the notice carried no name', () => {
    expect(messageOf(item({ payload: null }), t)).toBe('auth:notificationTokenCreated')
    expect(messageOf(item({ payload: { data: {} } }), t)).toBe('auth:notificationTokenCreated')
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
    render(<NotificationsList initialItems={[]} kinds={[]} initialChoices={[]} />)

    expect(screen.getByText('Nothing to tell you yet.')).toBeTruthy()
    expect(screen.queryByText('Mark all read')).toBeNull()
    expect(screen.queryByText("What you're told")).toBeNull()
  })

  it('shows each notification, who acted, and the unread ones bold with a way to mark them read', () => {
    render(
      <NotificationsList
        initialItems={[
          item({ id: 'a', actor: 'self' }),
          item({ id: 'b', kind: 'token_revoked', actor: 'staff', read_at: AT }),
          item({ id: 'c', kind: 'signed_out_by_policy', actor: 'other', read_at: AT }),
          item({ id: 'd', kind: 'signed_out_by_policy', variant: null, actor: null, read_at: AT, payload: {} }),
        ]}
        kinds={[]}
        initialChoices={[]}
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
    render(<NotificationsList initialItems={[item({})]} kinds={[]} initialChoices={[]} />)

    await userEvent.click(screen.getByText('Mark read'))

    expect(screen.queryByText('Mark read')).toBeNull()
    expect(screen.queryByText('Mark all read')).toBeNull()
    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.url).toContain('/v0/notifications/inbox/n1/read/')
  })

  it('marks one read now when the server gave no time', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, item({ read_at: null }))) as never
    render(<NotificationsList initialItems={[item({})]} kinds={[]} initialChoices={[]} />)

    await userEvent.click(screen.getByText('Mark read'))

    expect(screen.queryByText('Mark read')).toBeNull()
  })

  it('says so when marking one read fails, and leaves it unread', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(500, {})) as never
    render(<NotificationsList initialItems={[item({})]} kinds={[]} initialChoices={[]} />)

    await userEvent.click(screen.getByText('Mark read'))

    expect(toast.error).toHaveBeenCalledWith("Couldn't mark it read. Try again.")
    expect(screen.getByText('Mark read')).toBeTruthy()
  })

  it('marks every unread one read at once, and only those', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { marked: 2 })) as never
    render(
      <NotificationsList
        initialItems={[item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c', kind: 'token_revoked', read_at: AT })]}
        kinds={[]}
        initialChoices={[]}
      />
    )

    await userEvent.click(screen.getByText('Mark all read'))

    expect(screen.queryByText('Mark read')).toBeNull()
    expect(screen.queryByText('Mark all read')).toBeNull()
  })

  it('says so when marking them all read fails', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(500, {})) as never
    render(<NotificationsList initialItems={[item({})]} kinds={[]} initialChoices={[]} />)

    await userEvent.click(screen.getByText('Mark all read'))

    expect(toast.error).toHaveBeenCalledWith("Couldn't mark it read. Try again.")
    expect(screen.getByText('Mark all read')).toBeTruthy()
  })

  it('shows each kind on by its default until a choice says otherwise', () => {
    const off = {
      id: 's1',
      kind: 'application_reviewed',
      variant: null,
      enabled: false,
    } as Props['initialChoices'][number]
    const offForOneVariant = {
      id: 's2',
      kind: 'account_changed',
      variant: 'password_set',
      enabled: false,
    } as Props['initialChoices'][number]
    const offByDefault = {
      kind: 'account_changed',
      policy: 'default_off',
      variants: [],
    } as unknown as Props['kinds'][number]
    const { rerender } = render(
      <NotificationsList initialItems={[]} kinds={[ACCOUNT, REVIEWS]} initialChoices={[off, offForOneVariant]} />
    )

    expect((screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Your applications being approved or withdrawn') as HTMLInputElement).checked).toBe(
      false
    )
    rerender(<NotificationsList key="again" initialItems={[]} kinds={[offByDefault]} initialChoices={[]} />)
    expect((screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement).checked).toBe(false)
  })

  it('turns a kind off, keeping the choice the server answered with', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { id: 's1', kind: 'account_changed', variant: null, enabled: false })
    )
    globalThis.fetch = fetchMock as never
    render(<NotificationsList initialItems={[]} kinds={[ACCOUNT]} initialChoices={[]} />)

    await userEvent.click(screen.getByLabelText('Changes to your account, in your inbox'))

    expect((screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement).checked).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Saved.')
    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(await request.json()).toEqual({ kind: 'account_changed', enabled: false })
  })

  it('says so when a choice could not be saved, and keeps the box as it was', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, {})) as never
    render(<NotificationsList initialItems={[]} kinds={[ACCOUNT]} initialChoices={[]} />)

    await userEvent.click(screen.getByLabelText('Changes to your account, in your inbox'))

    expect(toast.error).toHaveBeenCalledWith("Couldn't save that. Try again.")
    expect((screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement).checked).toBe(true)
  })

  it('names the inbox and, when something may be turned off, what is chosen there', () => {
    render(<NotificationsList initialItems={[]} kinds={[ACCOUNT]} initialChoices={[]} />)

    expect(screen.getByText('Notifications')).toBeTruthy()
    expect(screen.getByText("What you're told")).toBeTruthy()
    expect(screen.getByText('Security notices always reach you. These you can turn off.')).toBeTruthy()
  })

  it.each([
    ['self', 'By you'],
    ['staff', 'By a staff member'],
    ['other', 'By someone else'],
  ])('says a notification %s acted on was by %s', (actor, words) => {
    render(
      <NotificationsList initialItems={[item({ actor: actor as Item['actor'] })]} kinds={[]} initialChoices={[]} />
    )

    expect(screen.getByText(`${moment(AT)} · ${words}`)).toBeTruthy()
  })

  it('names nobody when nobody acted', () => {
    render(<NotificationsList initialItems={[item({ actor: null })]} kinds={[]} initialChoices={[]} />)

    expect(screen.getByText(moment(AT))).toBeTruthy()
  })

  it('shows a read notification in plain text', () => {
    render(<NotificationsList initialItems={[item({ read_at: AT })]} kinds={[]} initialChoices={[]} />)

    expect(screen.getByText('A personal access token named "CI" was created.').className).toBe('text-sm')
  })

  it('holds each button down while its own request is on its way', async () => {
    let answer: (response: Response) => void = () => undefined
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))) as never
    render(
      <NotificationsList initialItems={[item({ id: 'a' }), item({ id: 'b' })]} kinds={[ACCOUNT]} initialChoices={[]} />
    )
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

  it('takes a choice that turned a kind on over the kind being off by default', () => {
    const offByDefault = {
      kind: 'account_changed',
      policy: 'default_off',
      variants: [],
    } as unknown as Props['kinds'][number]
    const on = { id: 's1', kind: 'account_changed', variant: null, enabled: true } as Props['initialChoices'][number]

    render(<NotificationsList initialItems={[]} kinds={[offByDefault]} initialChoices={[on]} />)

    expect((screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement).checked).toBe(true)
  })

  it('replaces an earlier choice with the one the server answered with', async () => {
    const off = { id: 's1', kind: 'account_changed', variant: null, enabled: false } as Props['initialChoices'][number]
    const other = {
      id: 's2',
      kind: 'application_reviewed',
      variant: null,
      enabled: false,
    } as Props['initialChoices'][number]
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(201, { id: 's1', kind: 'account_changed', variant: null, enabled: true })
    ) as never
    render(<NotificationsList initialItems={[]} kinds={[ACCOUNT, REVIEWS]} initialChoices={[off, other]} />)

    await userEvent.click(screen.getByLabelText('Changes to your account, in your inbox'))

    expect((screen.getByLabelText('Changes to your account, in your inbox') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Your applications being approved or withdrawn') as HTMLInputElement).checked).toBe(
      false
    )
  })
})
