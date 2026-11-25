import { WebhookEndpoints } from '@/components/app-webhooks/WebhookEndpoints'

import { freshDom } from '../../support/dom'
import { navigation, toast } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

type Props = Parameters<typeof WebhookEndpoints>[0]
type Endpoint = Props['endpoints'][number]

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const kinds = fc
  .uniqueArray(
    fc.record({
      kind: fc.stringMatching(/^[a-z]{3,10}$/),
      label: fc.option(fc.stringMatching(/^[A-Z][a-z]{3,10}$/), { nil: null }),
      // Every kind drawn goes out by webhook: one that doesn't is never offered, which a test of its own shows.
      channels: fc.constant({ webhook: { policy: 'mandatory' } }),
    }),
    { minLength: 1, maxLength: 3, selector: (kind) => kind.kind }
    // Only the name, label and webhook policy are read here; the rest of a kind is the inbox's business.
  )
  .map((list) => list as unknown as Props['kinds'])

const endpoint = (offered: Props['kinds']) =>
  fc.record({
    id: fc.uuid(),
    url: fc.webUrl(),
    is_active: fc.boolean(),
    // A kind the list no longer offers is still shown, by its name.
    kinds: fc.option(
      fc.subarray([...offered.map(({ kind }) => kind), 'retired']).map((names) => names.map((kind) => ({ kind }))),
      { nil: undefined }
    ),
    inert_kinds: fc.constant([]),
    consecutive_failures: fc.integer({ min: 1, max: 9 }),
    parked_at: fc.option(fc.constant('2026-01-01T00:00:00Z'), { nil: null }),
    secret: fc.constant(null),
    updated_at: fc.constant('2026-01-01T00:00:00Z'),
  }) as fc.Arbitrary<Endpoint>

const ACTS = ['Send again', 'Pause or resume', 'New secret', 'Delete'] as const
const PATHS: Record<(typeof ACTS)[number], [string, string]> = {
  'Send again': ['POST', 'unpark/'],
  'Pause or resume': ['PATCH', ''],
  'New secret': ['POST', 'rotate-secret/'],
  Delete: ['DELETE', ''],
}

const situation = kinds.chain((offered) =>
  fc.record({
    offered: fc.constant(offered),
    endpoints: fc.uniqueArray(endpoint(offered), { minLength: 1, maxLength: 3, selector: (e) => e.id }),
    row: fc.nat(),
    works: fc.boolean(),
  })
)

describe('the webhook endpoints', () => {
  test.prop([kinds])('say so when there are none', (offered) => {
    freshDom()
    render(<WebhookEndpoints endpoints={[]} kinds={offered} />)
    expect(screen.getByText('No endpoints yet.')).toBeTruthy()
  })

  // One property per act: drawn among four beside whether it works, the new secret's follow-up is one in eight.
  for (const act of ACTS)
    test.prop([situation])(
      `each show where they stand, and do what is asked of them against whatever is current: ${act}`,
      async ({ offered, endpoints, row, works }) => {
        freshDom()
        const target = endpoints[row % endpoints.length]
        const sent = vi.fn(async () =>
          works ? json(act === 'Delete' ? 204 : 200, { ...target, secret: 'whsec_new' }) : json(503, {})
        )
        vi.stubGlobal('fetch', sent)
        render(<WebhookEndpoints endpoints={endpoints} kinds={offered} />)
        const item = within(screen.getAllByRole('listitem')[row % endpoints.length])
        const running = target.is_active ? 'Active' : 'Paused'
        const standing = target.parked_at ? `Parked after ${target.consecutive_failures} failure` : running
        expect(item.getByText(new RegExp(`^${standing}`))).toBeTruthy()
        // Any element but the URL's, which may happen to contain a kind's name.
        for (const { kind } of target.kinds ?? [])
          expect(
            item
              .getAllByText(new RegExp(offered.find((k) => k.kind === kind)?.label ?? kind))
              .some((element) => !element.textContent?.includes(target.url))
          ).toBe(true)

        if (act === 'Send again' && !target.parked_at) {
          expect(item.queryByRole('button', { name: 'Send again' })).toBeNull()
          return
        }
        const toggle = target.is_active ? 'Pause' : 'Resume'
        const name = act === 'Pause or resume' ? toggle : act
        fireEvent.click(item.getByRole('button', { name }))
        await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
        const request = (sent.mock.calls[0] as unknown as [Request])[0]
        const [method, tail] = PATHS[act]
        expect(request.method).toBe(method)
        expect(new URL(request.url).pathname).toBe(`/v0/notifications/endpoints/${target.id}/${tail}`)
        expect(request.headers.get('If-Match')).toBe('*')
        expect(request.headers.get('Idempotency-Key')).toBeTruthy()
        if (act === 'Pause or resume') expect(await request.json()).toEqual({ is_active: !target.is_active })

        if (!works) {
          await vi.waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
              act === 'Delete' ? 'Could not delete the endpoint.' : 'Could not change the endpoint.'
            )
          )
          expect(navigation.refresh).not.toHaveBeenCalled()
          return
        }
        await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled())
        if (act !== 'New secret') return
        // The new secret is shown once, with a way to stop the old one signing.
        expect(await screen.findByText('whsec_new')).toBeTruthy()
        sent.mockClear()
        fireEvent.click(screen.getByRole('button', { name: 'Stop signing with the old secret' }))
        await vi.waitFor(() => expect(screen.queryByText(/old secret too/)).toBeNull())
        expect(new URL((sent.mock.calls[0] as unknown as [Request])[0].url).pathname).toBe(
          `/v0/notifications/endpoints/${target.id}/finish-rotation/`
        )
      }
    )

  // One property per case: a registration that went through is one draw in eight otherwise.
  for (const situation of ['registered', 'refused', 'no URL', 'no kind'])
    test.prop([kinds, fc.webUrl({ validSchemes: ['https'] }), fc.stringMatching(/^[a-z]{1,10}$/)])(
      `register one only with a whole URL and at least one kind, showing its secret once: ${situation}`,
      async (offered, wholeUrl, broken) => {
        const url = situation === 'no URL' ? broken : wholeUrl
        const choosing = situation !== 'no kind'
        const works = situation === 'registered'
        freshDom()
        const sent = vi.fn(async () =>
          works ? json(201, { id: 'new', url, secret: 'whsec_first' }) : json(400, { url: ['Unreachable.'] })
        )
        vi.stubGlobal('fetch', sent)
        render(<WebhookEndpoints endpoints={[]} kinds={offered} />)
        fireEvent.change(screen.getByLabelText('URL'), { target: { value: url } })
        if (choosing) fireEvent.click(screen.getAllByRole('checkbox')[0])
        fireEvent.click(screen.getByRole('button', { name: 'Add endpoint' }))
        const whole = url.startsWith('https://')
        if (!whole || !choosing) {
          if (!whole) expect(await screen.findByText(/Enter a full URL/)).toBeTruthy()
          if (!choosing) expect(await screen.findByText('Choose at least one kind of notification.')).toBeTruthy()
          expect(sent).not.toHaveBeenCalled()
          return
        }
        await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
        expect(await (sent.mock.calls[0] as unknown as [Request])[0].json()).toEqual({
          url,
          kinds: [{ kind: offered[0].kind }],
        })
        if (works) {
          expect(await screen.findByText('whsec_first')).toBeTruthy()
          expect(screen.queryByRole('button', { name: 'Stop signing with the old secret' })).toBeNull()
        } else expect(await screen.findByText('Unreachable.')).toBeTruthy()
      }
    )
})
