import { EmailsList } from '@/components/app-auth/EmailsList'

import { useEmailRowActions } from '@/lib/useEmailRowActions'

import { address, allauthRefusal } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { toast } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const t = ((key: string) => key) as never

const emails = fc
  .uniqueArray(fc.record({ email: address, verified: fc.boolean() }), {
    minLength: 1,
    maxLength: 3,
    selector: (row) => row.email,
  })
  .map((rows) => rows.map((row, index) => ({ ...row, primary: index === 0 })))

const ACTS = ['makePrimary', 'resendVerification', 'remove'] as const
const SAID: Record<(typeof ACTS)[number], [string, string, string]> = {
  makePrimary: ['PATCH', 'auth:profileEmailMadePrimary', 'auth:profileEmailMakePrimaryError'],
  resendVerification: ['PUT', 'auth:profileEmailVerificationResent', 'auth:profileEmailResendError'],
  remove: ['DELETE', 'auth:profileEmailRemoved', 'auth:profileEmailRemoveError'],
}

describe("an address's own actions", () => {
  test.prop([emails, fc.constantFrom(...ACTS), fc.boolean()])(
    'each send their request for that address, and keep the list the server answers',
    async (rows, act_, works) => {
      freshDom()
      const sent = vi.fn(async () =>
        works ? json(200, { status: 200, data: rows }) : json(400, { status: 400, errors: [] })
      )
      vi.stubGlobal('fetch', sent)
      const kept = vi.fn()
      const { result } = renderHook(() => useEmailRowActions(t, kept))
      await act(() => result.current[act_](rows[0].email))
      // The first call may be the session read that hands out a CSRF cookie.
      const requests = (sent.mock.calls as unknown as [RequestInfo, RequestInit | undefined][]).map(
        ([input, init]) => new Request(input, init)
      )
      const request = requests.find((each) => each.method !== 'GET') as Request
      const [method, success, failure] = SAID[act_]
      expect(request.method).toBe(method)
      expect(await request.json()).toMatchObject({ email: rows[0].email })
      if (works) expect(toast.success).toHaveBeenCalledWith(success)
      else expect(toast.error).toHaveBeenCalledWith(failure)
      expect(kept).toHaveBeenCalledTimes(works && act_ !== 'resendVerification' ? 1 : 0)
    }
  )
})

describe("this person's addresses", () => {
  test.prop([emails])('offer on each only the acts it allows, and none on a verified primary', (rows) => {
    freshDom()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { status: 200, data: rows }))
    )
    render(<EmailsList initialEmails={rows} />)
    const triggers = screen.getAllByRole('button', { name: 'Email actions' }) as HTMLButtonElement[]
    rows.forEach((row, index) => expect(triggers[index].disabled).toBe(row.primary && row.verified))
    const index = rows.findIndex((row) => !row.primary || !row.verified)
    if (index < 0) return
    fireEvent.click(triggers[index])
    const row = rows[index]
    const offered = [
      !row.primary && 'Make primary',
      !row.verified && 'Resend verification',
      !row.primary && 'Remove',
    ].filter(Boolean) as string[]
    for (const name of offered) expect(screen.getByRole('button', { name })).toBeTruthy()
    // Clicked without awaiting: an await after opening the menu hangs jsdom.
    for (const name of offered) fireEvent.click(screen.getByRole('button', { name }))
  })

  // Each kind of row alone, so every act's button is pressed in every run, not only when a draw offers it.
  for (const kind of [
    { primary: false, verified: true },
    { primary: false, verified: false },
    { primary: true, verified: false },
  ])
    test.prop([address])(`offer exactly the acts a row allows: ${JSON.stringify(kind)}`, (email) => {
      freshDom()
      const row = { email, ...kind }
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json(200, { status: 200, data: [row] }))
      )
      render(<EmailsList initialEmails={[row]} />)
      // The menu is a popover and a drawer at once, each with its own trigger.
      fireEvent.click(screen.getAllByRole('button', { name: 'Email actions' })[0])
      const offered = [
        !row.primary && 'Make primary',
        !row.verified && 'Resend verification',
        !row.primary && 'Remove',
      ].filter(Boolean) as string[]
      for (const name of offered) fireEvent.click(screen.getAllByRole('button', { name })[0])
    })

  test.prop([
    emails,
    fc.oneof(address, fc.stringMatching(/^[a-z]{2,8}$/)),
    fc.constantFrom('added', 'refused about it', 'refused about nothing'),
  ])('add one only when it is an address, keeping the list the server answers', async (rows, typed, outcome) => {
    const works = outcome === 'added'
    const field = outcome === 'refused about it' ? 'email' : undefined
    freshDom()
    const sent = vi.fn(async () =>
      works
        ? json(200, { status: 200, data: [...rows, { email: typed, primary: false, verified: false }] })
        : allauthRefusal('Already yours.', field)
    )
    vi.stubGlobal('fetch', sent)
    render(<EmailsList initialEmails={rows} />)
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: typed } })
    // Submitted past the browser's own check of an email field, which jsdom applies to a click too.
    fireEvent.submit(screen.getByRole('button', { name: 'Add email' }).closest('form') as HTMLFormElement)
    if (!typed.includes('@')) {
      expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
      expect(sent).not.toHaveBeenCalled()
      return
    }
    if (works) {
      expect(await screen.findByText(typed)).toBeTruthy()
      expect((screen.getByPlaceholderText('Email') as HTMLInputElement).value).toBe('')
    } else expect(await screen.findByText('Already yours.')).toBeTruthy()
  })
})
