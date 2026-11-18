import { NOTIFICATIONS_READ, NotificationBell } from '@/components/app-auth/NotificationBell'
import { NotificationsList, messageOf } from '@/components/app-auth/NotificationsList'
import { SettingsList, lastEnd, parsed, whyOf } from '@/components/app-auth/SettingsList'

import type { Translate } from '@/i18n/config'

import { freshDom } from '../../support/dom'
import { toast } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key) as unknown as Translate
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

const name = fc.stringMatching(/^[a-z][a-z_]{2,10}$/)
const word = fc.stringMatching(/^[A-Z][a-z]{2,8}$/)
const origin = fc.constantFrom('default', 'chosen', 'forced', 'feature_missing', 'limited')
const base = {
  label: fc.option(word, { nil: null }),
  description: fc.option(word, { nil: null }),
  origin,
  forced_reason: fc.option(word, { nil: null }),
  may_change: fc.boolean(),
  requires_feature: fc.constant(null),
}
const setting = fc.oneof(
  fc.record({
    name,
    type: fc.constant('bool' as const),
    value: fc.boolean(),
    default: fc.boolean(),
    chosen: fc.constant(null),
    ...base,
  }),
  fc.record({
    name,
    type: fc.constant('int' as const),
    value: fc.integer({ min: 0, max: 99 }),
    default: fc.constant(1),
    chosen: fc.constant(null),
    ...base,
  }),
  fc.record({
    name,
    type: fc.constant('text' as const),
    value: word,
    default: fc.constant(''),
    chosen: fc.constant(null),
    ...base,
  }),
  fc.record({
    name,
    type: fc.constant('choice' as const),
    value: fc.constant('b'),
    default: fc.constant('a'),
    chosen: fc.constant(null),
    choices: fc.constant([
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ]),
    ...base,
  })
)
const settings = fc.uniqueArray(setting, { selector: (each) => each.name, maxLength: 4 })
const when = fc
  .date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true })
  .map((date) => date.toISOString())
const feature = fc.record({
  name,
  label: fc.oneof(fc.constant(null), word),
  description: fc.constant(''),
  held: fc.boolean(),
  // Every grant ending, drawn on its own: field by field, a feature with an end is seldom drawn.
  grants: fc.oneof(
    fc.array(fc.record({ expires_at: when }), { minLength: 1, maxLength: 3 }),
    fc.array(fc.record({ expires_at: fc.option(when, { nil: null }) }), { maxLength: 3 })
  ),
})

describe('a setting', () => {
  test.prop([setting])("says why it is what it is only when that is not the person's own doing", (each) => {
    const why = whyOf(each as never, t)
    if (each.origin === 'forced')
      expect(why).toBe(
        each.forced_reason
          ? `auth:profileSettingsForcedBecause:${JSON.stringify({ reason: each.forced_reason })}`
          : 'auth:profileSettingsForced'
      )
    else if (each.origin === 'feature_missing') expect(why).toBe('auth:profileSettingsNeedsFeature')
    else if (each.origin === 'limited') expect(why).toBe('auth:profileSettingsLimited')
    else expect(why).toBeNull()
  })

  // Blank drawn on its own: fc.string() makes one too seldom for a number setting to meet it.
  // One property per type, so every type meets a blank draft in every run.
  for (const type of ['int', 'float', 'text', 'bool'])
    test.prop([fc.oneof(fc.integer().map(String), fc.constantFrom('', '  '), fc.string())])(
      `is sent as a number only where it is one, and empty text is left for the backend to refuse: ${type}`,
      (draft) => {
        const value = parsed({ type } as never, draft)
        if ((type === 'int' || type === 'float') && draft.trim() !== '') expect(value).toBe(Number(draft))
        else expect(value).toBe(draft)
      }
    )

  test.prop([feature])('lasts until its last grant ends, and has no end while any grant never does', (each) => {
    const ends = each.grants.map((grant) => grant.expires_at)
    const expected =
      ends.length === 0 || ends.includes(null)
        ? null
        : new Date(Math.max(...(ends as string[]).map(Date.parse))).toISOString()
    expect(lastEnd(each as never)).toBe(expected)
  })
})

describe("this person's settings", () => {
  // With one held feature that ends and one that never does beside the drawn ones, and with none held at all.
  for (const holding of [true, false])
    test.prop([settings, fc.array(feature, { maxLength: 3 })])(
      `show each setting by its type, shut where it may not change, and the features held: ${holding ? 'some held' : 'none held'}`,
      (list, drawn) => {
        freshDom()
        const ending = {
          name: 'ending_x',
          label: null,
          description: '',
          held: true,
          grants: [{ expires_at: '2030-01-01T00:00:00.000Z' }],
        }
        const lasting = {
          name: 'lasting_x',
          label: 'Lasting',
          description: '',
          held: true,
          grants: [{ expires_at: null }],
        }
        const others = drawn.filter((each) => !each.name.endsWith('_x'))
        const features = holding ? [...others, ending, lasting] : others.map((each) => ({ ...each, held: false }))
        render(<SettingsList initialSettings={list as never} initialEtag='"1"' features={features as never} />)
        for (const each of list) {
          const control = document.getElementById(`setting_${each.name}`) as HTMLInputElement
          expect(control.disabled).toBe(!each.may_change)
          expect(control.tagName).toBe(each.type === 'choice' ? 'SELECT' : 'INPUT')
          if (each.type === 'bool') expect(control.checked).toBe(each.value)
        }
        const held = features.filter((each) => each.held)
        expect(screen.queryByText('No extra features.') !== null).toBe(held.length === 0)
      }
    )

  // A refusal naming the value, one saying why, or one saying nothing; and others beside it that stay as they were.
  // One property per answer, each refusal its own.
  for (const outcome of ['saved', 'stale', 'refused naming the value', 'refused saying why', 'refused saying nothing'])
    test.prop([setting.filter((each) => each.may_change), settings])(
      `save a change against the version they were read at, reading them again when somebody else got there first: ${outcome}`,
      async (each, others) => {
        const status = { saved: 200, stale: 412 }[outcome as string] ?? 400
        const refusal =
          { 'refused naming the value': 'value', 'refused saying why': 'detail' }[outcome as string] ?? 'nothing'
        freshDom()
        const changed = { ...each, value: each.type === 'bool' ? !each.value : each.value }
        const sent = vi.fn(async (input: RequestInfo | URL) => {
          const request = input as Request
          if (request.method === 'GET') return json(200, [changed], { ETag: '"3"' })
          if (status === 200) return json(200, changed, { ETag: '"2"' })
          if (status === 412) return json(412, { detail: 'stale' })
          return json(
            400,
            { value: { value: ['Not allowed.'] }, detail: { detail: 'Not allowed.' }, nothing: {} }[refusal]
          )
        })
        vi.stubGlobal('fetch', sent)
        // Always one other, which a save must leave as it was.
        const beside = [
          ...others.filter((other) => other.name !== each.name && other.name !== `${each.name}x`),
          { ...each, name: `${each.name}x` },
        ]
        render(<SettingsList initialSettings={[each, ...beside] as never} initialEtag='"1"' features={[]} />)
        const control = document.getElementById(`setting_${each.name}`) as HTMLInputElement
        if (each.type === 'bool') fireEvent.click(control)
        else if (each.type === 'choice') fireEvent.change(control, { target: { value: 'a' } })
        else {
          // A value other than the one held, which would leave nothing to save.
          fireEvent.change(control, {
            target: { value: each.type === 'int' ? String(Number(each.value) + 1) : `${each.value}x` },
          })
          fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        }
        await vi.waitFor(() =>
          expect(sent.mock.calls.some(([input]) => (input as Request).method === 'PATCH')).toBe(true)
        )
        const patch = sent.mock.calls
          .map(([input]) => input as Request)
          .find((request) => request.method === 'PATCH') as Request
        expect(patch.headers.get('If-Match')).toBe('"1"')
        expect((await patch.json()).type).toBe(each.type)
        if (status === 200) await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved.'))
        if (status === 400)
          await vi.waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
              refusal === 'nothing' ? 'That setting could not be saved.' : 'Not allowed.'
            )
          )
        if (status === 412)
          await vi.waitFor(() =>
            expect(sent.mock.calls.some(([input]) => (input as Request).method === 'GET')).toBe(true)
          )
      }
    )

  test.prop([setting.filter((each) => each.may_change && each.type === 'bool')])(
    'save nothing without a version to save against',
    (each) => {
      freshDom()
      const sent = vi.fn()
      vi.stubGlobal('fetch', sent)
      render(<SettingsList initialSettings={[each] as never} initialEtag={null} features={[]} />)
      fireEvent.click(document.getElementById(`setting_${each.name}`) as HTMLInputElement)
      expect(sent).not.toHaveBeenCalled()
    }
  )
})

const item = fc.record({
  id: fc.uuid(),
  kind: name,
  variant: fc.constant(null),
  title: fc.constant(null),
  message: fc.option(word, { nil: null }),
  actor: fc.constantFrom('self', 'staff', 'other', null),
  subject_label: fc.constant(null),
  subject_id: fc.constant(null),
  payload: fc.constant({}),
  read_at: fc.option(when, { nil: null }),
  created_at: when,
})
const items = fc.uniqueArray(item, { selector: (each) => each.id, maxLength: 4 })
const channelState = fc.record({
  may_change: fc.boolean(),
  forced: fc.boolean(),
  forced_reason: fc.option(word, { nil: null }),
  enabled: fc.boolean(),
})
// `fax` and `telex` stand for channels the project added, which are shown by their names.
const CHANNEL_LABELS: Record<string, string> = {
  inbox: 'In your inbox',
  email: 'By email',
  push: 'On your phone',
  fax: 'fax',
  telex: 'telex',
}
const kind = fc.record({
  kind: name,
  label: fc.option(word, { nil: null }),
  // The webhook comes as the backend sends it: nobody chooses on it, and staff never force it.
  channels: fc
    .record(
      { inbox: channelState, email: channelState, push: channelState, telex: channelState, fax: channelState },
      { requiredKeys: [] }
    )
    .map((chosen) => ({
      ...chosen,
      webhook: { may_change: false, forced: false, forced_reason: null, enabled: true },
    })),
})
const kinds = fc.uniqueArray(kind, { selector: (each) => each.kind, maxLength: 3 })
type DrawnKind = typeof kind extends fc.Arbitrary<infer K> ? K : never
const offeredOf = (each: DrawnKind) =>
  Object.entries(each.channels).filter(([, state]) => state.may_change || state.forced)

describe("this person's notifications", () => {
  test.prop([item])('say what the notice carried, or that something changed', (each) => {
    expect(messageOf(each as never, t)).toBe(each.message ?? 'auth:notificationSomethingChanged')
  })

  test.prop([items, kinds])(
    'offer marking what is unread, and only the kinds a person decides or staff decided',
    (list, offered) => {
      freshDom()
      render(<NotificationsList initialItems={list as never} initialKinds={offered as never} />)
      expect(screen.queryAllByRole('button', { name: 'Mark read' })).toHaveLength(
        list.filter((each) => !each.read_at).length
      )
      expect(screen.queryByRole('button', { name: 'Mark all read' }) !== null).toBe(list.some((each) => !each.read_at))
      expect(screen.queryAllByRole('checkbox')).toHaveLength(
        offered.reduce((count, each) => count + offeredOf(each).length, 0)
      )
      for (const box of screen.queryAllByRole('checkbox') as HTMLInputElement[]) {
        const legend = box.closest('fieldset')?.querySelector('legend')?.textContent
        const each = offered.find((candidate) => legend === (candidate.label ?? candidate.kind)) as DrawnKind
        const [, state] = offeredOf(each).find(
          ([channel]) => CHANNEL_LABELS[channel] === box.parentElement?.textContent
        ) as [string, { forced: boolean }]
        expect(box.disabled).toBe(state.forced)
      }
    }
  )

  // The API document types read_at optional, so an answer without one is drawn too.
  for (const [ok, stamped] of [
    [true, true],
    [true, false],
    [false, false],
  ] as const)
    test.prop([items.filter((list) => list.some((each) => !each.read_at)), fc.boolean()])(
      `stay read once the server says so, one or all, and tell the bell: ${ok ? `answered${stamped ? '' : ' without a time'}` : 'failed'}`,
      async (list, all) => {
        freshDom()
        const told = vi.fn()
        window.addEventListener(NOTIFICATIONS_READ, told)
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => (ok ? json(200, stamped ? { read_at: new Date().toISOString() } : {}) : json(500, {})))
        )
        render(<NotificationsList initialItems={list as never} initialKinds={[]} />)
        const unread = list.filter((each) => !each.read_at).length
        fireEvent.click(
          all
            ? screen.getByRole('button', { name: 'Mark all read' })
            : screen.getAllByRole('button', { name: 'Mark read' })[0]
        )
        if (ok) {
          await vi.waitFor(() =>
            expect(screen.queryAllByRole('button', { name: 'Mark read' })).toHaveLength(all ? 0 : unread - 1)
          )
          expect(told).toHaveBeenCalled()
        } else {
          await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't mark it read. Try again."))
          expect(screen.getAllByRole('button', { name: 'Mark read' })).toHaveLength(unread)
        }
        window.removeEventListener(NOTIFICATIONS_READ, told)
      }
    )

  test.prop([channelState, fc.boolean(), kinds])(
    'keep one channel of a kind turned on or off only once the server took it, and leave every other box be',
    async (inbox, ok, others) => {
      freshDom()
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => (ok ? json(200, { kind: 'chosen' }) : json(500, {})))
      )
      const each = { kind: 'chosen', label: null, channels: { inbox: { ...inbox, may_change: true, forced: false } } }
      const beside = others.filter((other) => other.kind !== each.kind)
      render(<NotificationsList initialItems={[]} initialKinds={[each, ...beside] as never} />)
      const boxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[]
      const before = boxes().map((box) => box.checked)
      fireEvent.click(boxes()[0])
      if (ok) await vi.waitFor(() => expect(boxes()[0].checked).toBe(!inbox.enabled))
      else await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save that. Try again."))
      if (!ok) expect(boxes()[0].checked).toBe(inbox.enabled)
      expect(
        boxes()
          .slice(1)
          .map((box) => box.checked)
      ).toEqual(before.slice(1))
    }
  )
})

describe('a kind staff decided', () => {
  test.prop([kind, channelState, fc.option(word, { nil: null })])(
    'says it was decided for them, and why when staff said',
    (each, inbox, reason) => {
      freshDom()
      const forced = { ...each, channels: { inbox: { ...inbox, forced: true, forced_reason: reason } } }
      render(<NotificationsList initialItems={[]} initialKinds={[forced] as never} />)
      expect(
        screen.getByText(reason ? `Decided for you by staff: ${reason}` : 'Decided for you by staff.')
      ).toBeTruthy()
      expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
    }
  )
})

describe('the notification bell', () => {
  // None, some and more than shown each drawn, and an answer and a failure each a property.
  for (const answered of [true, false])
    test.prop([fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 99 }), fc.integer({ min: 100, max: 500 }))])(
      `counts what is unread, capped, and counts again when something is read: ${answered ? 'answered' : 'failed'}`,
      async (count) => {
        freshDom()
        const sent = vi.fn(async () => (answered ? json(200, { count, results: [] }) : json(500, {})))
        vi.stubGlobal('fetch', sent)
        render(<NotificationBell />)
        await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
        const shown = answered ? count : 0
        const link = screen.getByRole('link')
        const badge = shown > 99 ? '99+' : String(shown)
        await vi.waitFor(() => expect(link.textContent).toBe(shown === 0 ? '' : badge))
        expect(link.getAttribute('href')).toBe('/profile/notifications')
        await act(async () => window.dispatchEvent(new Event(NOTIFICATIONS_READ)))
        expect(sent).toHaveBeenCalledTimes(2)
      }
    )
})
