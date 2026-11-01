import { WebhookEndpoints } from '@/components/app-webhooks/WebhookEndpoints'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

type Props = Parameters<typeof WebhookEndpoints>[0]
type Endpoint = Props['endpoints'][number]
type Kind = Props['kinds'][number]

function endpoint(fields: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'e1',
    url: 'https://a.test/hook',
    is_active: true,
    kinds: [{ kind: 'account_changed' }],
    consecutive_failures: 0,
    parked_at: null,
    secret: null,
    updated_at: '2001-01-02T03:04:05Z',
    ...fields,
  }
}

const KINDS = [
  { kind: 'account_changed', label: 'Changes to an account' },
  { kind: 'token_created', label: null },
] as Kind[]

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function answering(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(async () => jsonResponse(status, body))
  globalThis.fetch = fetchMock as never
  return fetchMock
}

function sent(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const [request] = fetchMock.mock.calls[index] as unknown as [Request]
  return {
    method: request.method,
    path: new URL(request.url).pathname,
    key: request.headers.get('Idempotency-Key'),
    version: request.headers.get('If-Match'),
    request,
  }
}

const row = () => screen.getByRole('listitem')

describe('WebhookEndpoints', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('says when there are none, and offers every kind by its label, or its name without one', () => {
    render(<WebhookEndpoints endpoints={[]} kinds={KINDS} />)

    expect(screen.getByText('No endpoints yet.')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'What it is sent' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /Changes to an account/ })).toBeTruthy()
    expect(screen.getAllByText('token_created')).toHaveLength(2)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows each endpoint with what it is sent, by label where there is one', () => {
    render(
      <WebhookEndpoints
        endpoints={[endpoint({ kinds: [{ kind: 'account_changed' }, { kind: 'retired_kind' }] })]}
        kinds={KINDS}
      />
    )

    expect(within(row()).getByText('https://a.test/hook')).toBeTruthy()
    expect(within(row()).getByText('Changes to an account, retired_kind')).toBeTruthy()
    expect(within(row()).getByText('Active')).toBeTruthy()
    expect(within(row()).getByRole('button', { name: 'Pause' })).toBeTruthy()
    expect(within(row()).queryByRole('button', { name: 'Send again' })).toBeNull()
  })

  it('shows an endpoint that names no kinds with none listed', () => {
    const { kinds: _, ...bare } = endpoint()
    render(<WebhookEndpoints endpoints={[bare as Endpoint]} kinds={KINDS} />)

    expect(row().querySelector('p')?.textContent).toBe('')
  })

  it('says an endpoint is paused, and offers to resume it', () => {
    render(<WebhookEndpoints endpoints={[endpoint({ is_active: false })]} kinds={KINDS} />)

    expect(within(row()).getByText('Paused')).toBeTruthy()
    expect(within(row()).getByRole('button', { name: 'Resume' })).toBeTruthy()
  })

  it('says a parked endpoint is parked, how many failures put it there, and offers to send again', () => {
    const { rerender } = render(
      <WebhookEndpoints
        endpoints={[endpoint({ parked_at: '2001-01-02T03:04:05Z', consecutive_failures: 5 })]}
        kinds={KINDS}
      />
    )
    expect(within(row()).getByText('Parked after 5 failures')).toBeTruthy()
    expect(within(row()).getByRole('button', { name: 'Send again' })).toBeTruthy()

    rerender(
      <WebhookEndpoints
        endpoints={[endpoint({ parked_at: '2001-01-02T03:04:05Z', consecutive_failures: 1 })]}
        kinds={KINDS}
      />
    )
    expect(within(row()).getByText('Parked after 1 failure')).toBeTruthy()
  })

  it('asks for a full URL and at least one kind before sending anything', async () => {
    const fetchMock = answering(201)
    render(<WebhookEndpoints endpoints={[]} kinds={KINDS} />)

    await userEvent.type(screen.getByLabelText('URL'), 'not a url')
    await userEvent.click(screen.getByRole('button', { name: 'Add endpoint' }))

    expect(screen.getByText('Enter a full URL, like https://example.com/webhooks.')).toBeTruthy()
    expect(screen.getByText('Choose at least one kind of notification.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks for a kind alone when the URL is fine', async () => {
    render(<WebhookEndpoints endpoints={[]} kinds={KINDS} />)

    await userEvent.type(screen.getByLabelText('URL'), 'https://b.test/hook')
    await userEvent.click(screen.getByRole('button', { name: 'Add endpoint' }))

    expect(screen.getByText('Choose at least one kind of notification.')).toBeTruthy()
    expect(screen.queryByText('Enter a full URL, like https://example.com/webhooks.')).toBeNull()
  })

  it('registers an endpoint for the kinds ticked, under a key, and shows its secret once', async () => {
    const fetchMock = answering(201, endpoint({ id: 'e9', secret: 'the-secret' }))
    render(<WebhookEndpoints endpoints={[]} kinds={KINDS} />)

    await userEvent.type(screen.getByLabelText('URL'), 'https://b.test/hook')
    await userEvent.click(screen.getByRole('checkbox', { name: /Changes to an account/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add endpoint' }))

    const request = sent(fetchMock)
    expect(request).toMatchObject({ method: 'POST', path: '/v0/notifications/endpoints/' })
    expect(request.key).toBeTruthy()
    expect(await request.request.json()).toEqual({ url: 'https://b.test/hook', kinds: [{ kind: 'account_changed' }] })
    const issued = screen.getByRole('status')
    expect(within(issued).getByText('Signing secret')).toBeTruthy()
    expect(within(issued).getByText('Copy it now: it is not shown again. Each request is signed with it.')).toBeTruthy()
    expect(within(issued).getByText('the-secret')).toBeTruthy()
    expect(within(issued).queryByRole('button')).toBeNull()
    expect((screen.getByLabelText('URL') as HTMLInputElement).value).toBe('')
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('says so when the endpoint could not be registered, and keeps what was typed', async () => {
    answering(500)
    render(<WebhookEndpoints endpoints={[]} kinds={KINDS} />)

    await userEvent.type(screen.getByLabelText('URL'), 'https://b.test/hook')
    await userEvent.click(screen.getByRole('checkbox', { name: /Changes to an account/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add endpoint' }))

    expect(toast.error).toHaveBeenCalledWith('Could not add the endpoint.')
    expect((screen.getByLabelText('URL') as HTMLInputElement).value).toBe('https://b.test/hook')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it.each([
    ['Pause', endpoint(), 'PATCH', '/v0/notifications/endpoints/e1/', { is_active: false }],
    ['Resume', endpoint({ is_active: false }), 'PATCH', '/v0/notifications/endpoints/e1/', { is_active: true }],
    [
      'Send again',
      endpoint({ parked_at: '2001-01-02T03:04:05Z' }),
      'POST',
      '/v0/notifications/endpoints/e1/unpark/',
      null,
    ],
    ['Delete', endpoint(), 'DELETE', '/v0/notifications/endpoints/e1/', null],
  ])(
    '%s sends against whatever version is current, under a key, then reads the page again',
    async (name, shown, method, path, body) => {
      const fetchMock = answering(200, shown)
      render(<WebhookEndpoints endpoints={[shown]} kinds={KINDS} />)

      await userEvent.click(within(row()).getByRole('button', { name }))

      const request = sent(fetchMock)
      expect(request).toMatchObject({ method, path, version: '*' })
      expect(request.key).toBeTruthy()
      if (body) expect(await request.request.json()).toEqual(body)
      expect(refresh).toHaveBeenCalledOnce()
      expect(screen.queryByRole('status')).toBeNull()
    }
  )

  it.each([
    ['Pause', endpoint(), 'Could not change the endpoint.'],
    ['Send again', endpoint({ parked_at: '2001-01-02T03:04:05Z' }), 'Could not change the endpoint.'],
    ['New secret', endpoint(), 'Could not change the endpoint.'],
    ['Delete', endpoint(), 'Could not delete the endpoint.'],
  ])('says so when %s fails, and reads nothing again', async (name, shown, message) => {
    answering(500)
    render(<WebhookEndpoints endpoints={[shown]} kinds={KINDS} />)

    await userEvent.click(within(row()).getByRole('button', { name }))

    expect(toast.error).toHaveBeenCalledWith(message)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('sends a retry of the same act under the same key, and a new act under a new one', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(200, endpoint()))
      .mockResolvedValueOnce(jsonResponse(200, endpoint()))
    globalThis.fetch = fetchMock as never
    render(<WebhookEndpoints endpoints={[endpoint()]} kinds={KINDS} />)

    await userEvent.click(within(row()).getByRole('button', { name: 'Pause' }))
    await userEvent.click(within(row()).getByRole('button', { name: 'Pause' }))
    await userEvent.click(within(row()).getByRole('button', { name: 'Pause' }))

    expect(sent(fetchMock, 1).key).toBe(sent(fetchMock, 0).key)
    expect(sent(fetchMock, 2).key).not.toBe(sent(fetchMock, 1).key)
  })

  it('keys a pause of one endpoint apart from a pause of another', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(200, endpoint()))
    globalThis.fetch = fetchMock as never
    render(
      <WebhookEndpoints endpoints={[endpoint(), endpoint({ id: 'e2', url: 'https://c.test/hook' })]} kinds={KINDS} />
    )
    const [first, second] = screen.getAllByRole('listitem')

    await userEvent.click(within(first).getByRole('button', { name: 'Pause' }))
    await userEvent.click(within(second).getByRole('button', { name: 'Pause' }))

    expect(sent(fetchMock, 1).path).toBe('/v0/notifications/endpoints/e2/')
    expect(sent(fetchMock, 1).key).not.toBe(sent(fetchMock, 0).key)
  })

  it('rotates the secret, shows the new one, and then stops signing with the old', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, endpoint({ secret: 'new-secret' })))
      .mockResolvedValueOnce(jsonResponse(200, endpoint()))
    globalThis.fetch = fetchMock as never
    render(<WebhookEndpoints endpoints={[endpoint()]} kinds={KINDS} />)

    await userEvent.click(within(row()).getByRole('button', { name: 'New secret' }))

    expect(sent(fetchMock, 0)).toMatchObject({ method: 'POST', path: '/v0/notifications/endpoints/e1/rotate-secret/' })
    const issued = screen.getByRole('status')
    expect(within(issued).getByText('new-secret')).toBeTruthy()
    expect(within(issued).getByText('Requests are signed with the old secret too, until you stop it.')).toBeTruthy()

    await userEvent.click(within(issued).getByRole('button', { name: 'Stop signing with the old secret' }))

    expect(sent(fetchMock, 1)).toMatchObject({
      method: 'POST',
      path: '/v0/notifications/endpoints/e1/finish-rotation/',
      version: '*',
    })
    expect(sent(fetchMock, 1).key).toBeTruthy()
    expect(within(screen.getByRole('status')).getByText('new-secret')).toBeTruthy()
    expect(within(screen.getByRole('status')).queryByRole('button')).toBeNull()
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('keeps offering to stop the old secret when stopping it failed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, endpoint({ secret: 'new-secret' })))
      .mockResolvedValueOnce(jsonResponse(500, {}))
    globalThis.fetch = fetchMock as never
    render(<WebhookEndpoints endpoints={[endpoint()]} kinds={KINDS} />)

    await userEvent.click(within(row()).getByRole('button', { name: 'New secret' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stop signing with the old secret' }))

    expect(toast.error).toHaveBeenCalledWith('Could not change the endpoint.')
    expect(screen.getByRole('button', { name: 'Stop signing with the old secret' })).toBeTruthy()
  })

  it('holds every action while one is in flight', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {})) as never
    render(<WebhookEndpoints endpoints={[endpoint({ parked_at: '2001-01-02T03:04:05Z' })]} kinds={KINDS} />)

    await userEvent.click(within(row()).getByRole('button', { name: 'Pause' }))

    for (const name of ['Pause', 'Send again', 'New secret', 'Delete']) {
      expect(within(row()).getByRole('button', { name })).toHaveProperty('disabled', true)
    }
    expect(screen.getByRole('button', { name: 'Add endpoint' })).toHaveProperty('disabled', false)
  })

  it('holds the register button while a registration is in flight', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {})) as never
    render(<WebhookEndpoints endpoints={[endpoint()]} kinds={KINDS} />)

    await userEvent.type(screen.getByLabelText('URL'), 'https://b.test/hook')
    await userEvent.click(screen.getByRole('checkbox', { name: /Changes to an account/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add endpoint' }))

    expect(screen.getByRole('button', { name: 'Add endpoint' })).toHaveProperty('disabled', true)
    expect(within(row()).getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', false)
  })
})
