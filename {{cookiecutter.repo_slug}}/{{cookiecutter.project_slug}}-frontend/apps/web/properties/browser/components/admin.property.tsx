import { GroupForm } from '@/components/app-admin/GroupForm'
import { SiteSettingsForm } from '@/components/app-admin/SiteSettingsForm'

import { freshDom } from '../../support/dom'
import { calls, navigation, toast } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const PERMISSIONS = [
  { name: 'users:grant:rights', label: 'Grant' },
  { name: 'users:manage:user', label: 'Manage' },
]
const NAMES = PERMISSIONS.map((scope) => scope.name)
const name = fc.stringMatching(/^[a-z][a-z0-9]{0,11}$/)
const held = fc.oneof(fc.constant(undefined), fc.subarray(NAMES))
const answer = fc.constantFrom(200, 412, 400)

const answering = (status: number, body: unknown) => {
  const sent = vi.fn(async () =>
    status === 200
      ? json(200, body)
      : json(status, status === 412 ? { detail: 'stale', current: body } : { detail: 'No.' })
  )
  vi.stubGlobal('fetch', sent)
  return sent
}

describe('a group', () => {
  // One property per kind, so a new group and a changed one are both reached every run.
  for (const kind of ['new', 'existing'] as const)
    test.prop([kind === 'new' ? fc.constant(undefined) : fc.tuple(name, held), name, fc.subarray(NAMES), answer])(
      `is made or changed to exactly the name and permissions the form holds: ${kind}`,
      async (existing, typed, flipped, status) => {
        freshDom()
        const group = existing && {
          id: 'g1',
          name: existing[0],
          permissions: existing[1],
          created_at: '',
          updated_at: '',
        }
        const sent = answering(status, { id: 'g9', name: typed, permissions: [] })
        render(<GroupForm group={group as never} etag='"1"' permissions={PERMISSIONS} />)
        const box = screen.getByLabelText('Name') as HTMLInputElement
        fireEvent.change(box, { target: { value: typed } })
        for (const permission of flipped)
          fireEvent.click(
            screen.getByRole('checkbox', {
              name: new RegExp(`^${PERMISSIONS.find((s) => s.name === permission)!.label} `),
            })
          )
        fireEvent.click(screen.getByRole('button', { name: group ? 'Save' : 'Create' }))
        await vi.waitFor(() => expect(sent).toHaveBeenCalled())

        const request = calls(sent)[0][0] as Request
        const was = new Set(group?.permissions ?? [])
        const expected = NAMES.filter((permission) => was.has(permission) !== flipped.includes(permission))
        expect(request.method).toBe(group ? 'PATCH' : 'POST')
        expect(request.headers.get('If-Match')).toBe(group ? '"1"' : null)
        expect(request.headers.get('Idempotency-Key')).toBeTruthy()
        const body = await request.json()
        expect([body.name, [...body.permissions].sort()]).toEqual([typed, expected])
        if (status === 200 && !group) await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/groups/g9'))
        else if (status !== 400) await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled())
        else await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('No.'))
      }
    )

  test.prop([name, answer])(
    'is deleted against the version read, and left for the list only once gone',
    async (named, status) => {
      freshDom()
      const sent = vi.fn(async () =>
        status === 200 ? new Response(null, { status: 204 }) : json(status, { detail: 'No.' })
      )
      vi.stubGlobal('fetch', sent)
      const group = { id: 'g1', name: named, permissions: [], created_at: '', updated_at: '' }
      render(<GroupForm group={group as never} etag='"4"' permissions={PERMISSIONS} />)
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
      await vi.waitFor(() => expect(sent).toHaveBeenCalled())

      const request = calls(sent)[0][0] as Request
      expect([request.method, request.headers.get('If-Match')]).toEqual(['DELETE', '"4"'])
      if (status === 200) await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/groups'))
      else expect(navigation.push).not.toHaveBeenCalledWith('/groups')
    }
  )
})

describe('the site settings', () => {
  const policy = fc.constantFrom('everyone', 'staff', 'superusers')

  // One property per answer, counted or not, so both are reached every run.
  for (const counted of [true, false])
    test.prop([
      fc.option(policy, { nil: undefined }),
      policy,
      fc.boolean(),
      fc.boolean(),
      counted ? fc.nat(9) : fc.constant(null),
      answer,
    ])(
      `send the rung and the mail choice the form holds, saying how many it signed out: counted ${counted}`,
      async (saved, chosen, superuser, mail, signedOut, status) => {
        freshDom()
        const sent = answering(status, { login_policy: chosen, signed_out: signedOut, created_at: '', updated_at: '' })
        const settings = { login_policy: saved, signed_out: null, created_at: '', updated_at: '' }
        render(<SiteSettingsForm settings={settings as never} etag='"2"' isSuperuser={superuser} />)
        const labels: Record<string, string> = {
          everyone: 'Everyone',
          staff: 'Staff and superusers',
          superusers: 'Superusers only',
        }
        const rung = screen.getByRole('radio', { name: labels[chosen] }) as HTMLInputElement
        // A browser sends no click to a disabled control; fireEvent would.
        if (!rung.disabled) fireEvent.click(rung)
        if (mail) fireEvent.click(screen.getByRole('checkbox', { name: /Email the people/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await vi.waitFor(() => expect(sent).toHaveBeenCalled())

        // A disabled rung was never chosen, so what is sent is what was saved.
        const sentRung = rung.disabled ? (saved ?? 'everyone') : chosen
        expect(rung.disabled).toBe(chosen === 'superusers' && !superuser)
        const request = calls(sent)[0][0] as Request
        expect(request.headers.get('If-Match')).toBe('"2"')
        expect(await request.json()).toEqual({ login_policy: sentRung, mail_the_people_signed_out: mail })
        if (status === 200) {
          const count = signedOut ?? 0
          await vi.waitFor(() =>
            expect(toast.success).toHaveBeenCalledWith(
              `Saved. ${count} ${count === 1 ? 'session' : 'sessions'} signed out.`
            )
          )
        } else if (status === 412) await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled())
        else await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('No.'))
      }
    )
})
