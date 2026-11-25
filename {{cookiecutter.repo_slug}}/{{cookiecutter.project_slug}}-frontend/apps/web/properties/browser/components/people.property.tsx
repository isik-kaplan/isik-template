import { DeviceConsent } from '@/components/app-device/DeviceConsent'
import { StorageDisclosure } from '@/components/app-legal/StorageDisclosure'
import { ManageUserForm } from '@/components/app-people/ManageUserForm'

import { STORAGE_ITEMS } from '@/lib/storageDisclosure'

import { address } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { calls, navigation, toast } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

const FLAGS = ['is_active', 'is_staff', 'is_superuser'] as const
const permissions = fc
  .uniqueArray(
    fc.record({ name: fc.stringMatching(/^[a-z]{2,5}:[a-z]{2,5}$/), label: fc.stringMatching(/^[A-Z][a-z]{2,8}$/) }),
    { selector: (scope) => scope.name, maxLength: 3 }
  )
  .filter((list) => new Set(list.map((scope) => scope.label)).size === list.length)
const managed = fc.record({
  id: fc.uuid(),
  username: fc.constant(null),
  email: address,
  first_name: fc.constant(''),
  last_name: fc.constant(''),
  // Each flag absent as often as set: fc.option leaves one out one time in six.
  is_active: fc.oneof(fc.constant(undefined), fc.boolean()),
  is_staff: fc.oneof(fc.constant(undefined), fc.boolean()),
  is_superuser: fc.oneof(fc.constant(undefined), fc.boolean()),
  permissions: fc.oneof(fc.constant(undefined), fc.constant([] as string[])),
  // In the first group offered or not, so clicking each both joins and leaves.
  groups: fc.oneof(fc.constant(undefined), fc.constant([] as string[]), fc.constant(['g0'])),
  last_login: fc.constant(null),
  created_at: fc.constant(''),
  updated_at: fc.constant(''),
})
// Named apart from every permission's label, so a checkbox is found by its group's name alone.
const offeredGroups = fc
  .integer({ min: 0, max: 2 })
  .map((count) => Array.from({ length: count }, (_, index) => ({ id: `g${index}`, name: `group ${index}` })))

describe('managing somebody', () => {
  test.prop([managed, permissions, offeredGroups, fc.subarray([...FLAGS]), fc.constantFrom(200, 412, 400)])(
    'sends every flag, grant and group as the form holds them, against the version read, under a key',
    async (user, offered, groups, flipped, status) => {
      freshDom()
      const sent = vi.fn(async () =>
        json(
          status,
          (
            { 412: { detail: 'stale', current: user }, 400: { detail: 'Not yours to change.' } } as Record<
              number,
              unknown
            >
          )[status] ?? user,
          {
            ETag: '"2"',
          }
        )
      )
      vi.stubGlobal('fetch', sent)
      render(<ManageUserForm user={user as never} etag='"1"' permissions={offered} groups={groups} />)
      const held = {
        is_active: user.is_active ?? true,
        is_staff: user.is_staff ?? false,
        is_superuser: user.is_superuser ?? false,
      }
      for (const flag of FLAGS)
        expect((document.querySelector(`input[name=${flag}]`) as HTMLInputElement).checked).toBe(held[flag])
      for (const flag of flipped) fireEvent.click(document.querySelector(`input[name=${flag}]`) as HTMLInputElement)
      const granted = offered.slice(0, 1)
      for (const scope of granted)
        fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`^${scope.label} `) }))
      for (const group of groups) fireEvent.click(screen.getByRole('checkbox', { name: group.name }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await vi.waitFor(() => expect(sent).toHaveBeenCalled())
      const request = calls(sent)[0][0] as Request
      expect(request.headers.get('If-Match')).toBe('"1"')
      expect(request.headers.get('Idempotency-Key')).toBeTruthy()
      expect(await request.json()).toEqual({
        ...Object.fromEntries(FLAGS.map((flag) => [flag, flipped.includes(flag) ? !held[flag] : held[flag]])),
        permissions: granted.map((scope) => scope.name),
        groups: groups
          .map((group) => group.id)
          .filter((id) => !(user.groups ?? []).includes(id))
          .concat((user.groups ?? []).filter((id) => !groups.some((group) => group.id === id))),
      })
      if (status === 400) await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not yours to change.'))
      else await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled())
    }
  )
})

describe("a device's request to sign in", () => {
  test.prop([fc.stringMatching(/^[A-Z]{4}-[A-Z]{4}$/), fc.boolean(), fc.boolean()])(
    'is answered once, allowed or denied, and a refusal leaves both answers open',
    async (code, allow, ok) => {
      freshDom()
      const sent = vi.fn(async () => (ok ? json(200, {}) : json(400, { detail: 'Expired.' })))
      vi.stubGlobal('fetch', sent)
      render(<DeviceConsent userCode={code} />)
      fireEvent.click(screen.getAllByRole('button')[allow ? 0 : 1])
      await vi.waitFor(() => expect(sent).toHaveBeenCalled())
      const request = calls(sent)[0][0] as Request
      expect(new URL(request.url).pathname).toContain(code)
      expect(new URL(request.url).pathname.endsWith(allow ? 'approve/' : 'deny/')).toBe(true)
      expect(request.headers.get('Idempotency-Key')).toBeTruthy()
      if (ok) {
        expect((await screen.findByRole('status')).textContent?.length).toBeGreaterThan(0)
        expect(screen.queryAllByRole('button')).toHaveLength(0)
      } else {
        await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Expired.'))
        expect(screen.getAllByRole('button')).toHaveLength(2)
      }
    }
  )
})

describe('the storage disclosure', () => {
  test('lists every item the site sets, by name, kind and purpose', () => {
    freshDom()
    render(<StorageDisclosure />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((row) => row.querySelector('th')?.textContent)).toEqual(STORAGE_ITEMS.map((item) => item.name))
    for (const row of rows)
      expect([...row.querySelectorAll('td')].every((cell) => (cell.textContent ?? '').length > 0)).toBe(true)
  })
})
