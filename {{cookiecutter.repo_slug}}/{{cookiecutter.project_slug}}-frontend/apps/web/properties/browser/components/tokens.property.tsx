import { expiresAt } from '@/components/app-auth/PersonalAccessTokenForm'
import { PersonalAccessTokensList, hasPassed } from '@/components/app-auth/PersonalAccessTokensList'

import { drfRefusal } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { calls, toast } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const DAY = 24 * 60 * 60 * 1000
const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const scopes = fc
  .uniqueArray(
    fc.record({ name: fc.stringMatching(/^[a-z]{2,6}:[a-z]{2,6}$/), label: fc.stringMatching(/^[A-Z][a-z]{2,8}$/) }),
    {
      selector: (scope) => scope.name,
      maxLength: 3,
    }
  )
  .filter((list) => new Set(list.map((scope) => scope.label)).size === list.length)
const when = fc
  .date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true })
  .map((date) => date.toISOString())
const tokens = fc.uniqueArray(
  fc.record({
    id: fc.uuid(),
    name: fc.stringMatching(/^[A-Za-z][a-z]{2,8}$/),
    scopes: fc.subarray(['a:b', 'c:d']),
    expires_at: fc.option(when, { nil: undefined }),
    last_used_at: fc.option(when, { nil: null }),
    token: fc.constant(null),
    created_at: when,
    updated_at: when,
  }),
  { selector: (token) => token.name, maxLength: 3 }
)

describe('when a token stops working', () => {
  test.prop([fc.constantFrom(...(['7', '30', '90', '365'] as const)), fc.integer({ min: 0, max: 4_000_000_000_000 })])(
    'is the chosen number of days from now, and never for the lifetime',
    (days, now) => {
      expect(new Date(expiresAt(days, now) as string).getTime()).toBe(now + Number(days) * DAY)
      expect(expiresAt('lifetime', now)).toBeUndefined()
    }
  )

  test.prop([fc.integer({ min: 0, max: 4_000_000_000_000 }), fc.integer({ min: -100_000, max: 100_000 })])(
    'has passed exactly when it is not later than now',
    (now, offset) => {
      expect(hasPassed(new Date(now + offset).toISOString(), now)).toBe(offset <= 0)
    }
  )
})

describe("this person's tokens", () => {
  test.prop([tokens])(
    'are each listed with what they may do, how long they last, and when they were last used',
    (held) => {
      freshDom()
      render(<PersonalAccessTokensList initialTokens={held} scopes={[{ name: 'a:b', label: 'Read' }]} />)
      if (held.length === 0) expect(screen.getByText('You have no tokens.')).toBeTruthy()
      for (const token of held) {
        const row = screen.getByText(token.name).closest('li') as HTMLElement
        const text = row.textContent ?? ''
        expect(text.includes('Never expires')).toBe(!token.expires_at)
        if (token.expires_at) expect(text.includes(hasPassed(token.expires_at) ? 'Expired' : 'Expires')).toBe(true)
        expect(text.includes('Never used')).toBe(token.last_used_at === null)
        expect(text.includes('Only what needs no permission')).toBe(token.scopes.length === 0)
        if (token.scopes.includes('a:b')) expect(text).toContain('Read')
      }
    }
  )

  test.prop([tokens.filter((list) => list.length > 0), fc.nat(), fc.constantFrom(204, 400), fc.boolean()])(
    'lose one only when the server deleted it, and a retry is the same delete',
    async (held, pick, status, saysWhy) => {
      freshDom()
      const target = held[pick % held.length]
      const sent = vi.fn(async () => json(status, saysWhy ? { detail: 'Not deleted.' } : {}))
      vi.stubGlobal('fetch', sent)
      render(<PersonalAccessTokensList initialTokens={held} scopes={[]} />)
      const row = () => screen.getByText(target.name).closest('li') as HTMLElement
      fireEvent.click(within(row()).getByRole('button', { name: 'Delete' }))
      await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (status === 204) {
        await vi.waitFor(() => expect(screen.queryByText(target.name)).toBeNull())
        expect(toast.success).toHaveBeenCalledWith('Token deleted.')
        return
      }
      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(saysWhy ? 'Not deleted.' : 'Could not delete the token.')
      )
      fireEvent.click(within(row()).getByRole('button', { name: 'Delete' }))
      await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2))
      const keys = calls(sent).map(([input]) => (input as Request).headers.get('Idempotency-Key'))
      expect(keys[0]).toBeTruthy()
      expect(keys[1]).toBe(keys[0])
      expect(screen.getByText(target.name)).toBeTruthy()
    }
  )

  // One property per answer; the API document types the secret optional, so an answer without one is one of them.
  for (const outcome of ['made', 'refused about its name', 'refused about nothing', 'made, no secret'])
    test.prop([
      scopes,
      fc.stringMatching(/^[A-Za-z][a-z]{2,8}$/),
      fc.constantFrom('7', '30', '90', '365', 'lifetime'),
      fc.stringMatching(/^[a-z0-9]{20,30}$/),
    ])(`makes one with what was chosen, showing its secret once: ${outcome}`, async (offered, name, expiry, secret) => {
      freshDom()
      const refused = outcome.startsWith('refused')
      const field = outcome === 'refused about its name' ? 'name' : undefined
      const sent = vi.fn(async (input: RequestInfo | URL) => {
        const body = await (input as Request).clone().json()
        return refused
          ? drfRefusal('Taken.', field)
          : json(201, {
              id: crypto.randomUUID(),
              ...body,
              ...(outcome === 'made' ? { token: secret } : {}),
              last_used_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
      })
      vi.stubGlobal('fetch', sent)
      render(<PersonalAccessTokensList initialTokens={[]} scopes={offered} />)
      fireEvent.click(screen.getByRole('button', { name: 'New token' }))

      fireEvent.click(screen.getByRole('button', { name: 'Make token' }))
      expect(await screen.findByText('Give the token a name.')).toBeTruthy()
      expect(sent).not.toHaveBeenCalled()

      fireEvent.change(screen.getByLabelText('Name'), { target: { value: `  ${name} ` } })
      const chosen = offered.filter((_, index) => index % 2 === 0)
      for (const scope of chosen)
        fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`^${scope.label} `) }))
      fireEvent.change(screen.getByLabelText('Expires'), { target: { value: expiry } })
      fireEvent.click(screen.getByRole('button', { name: 'Make token' }))
      await vi.waitFor(() => expect(sent).toHaveBeenCalled())
      const body = await (calls(sent)[0][0] as Request).json()
      expect(body.name).toBe(name)
      expect(body.scopes).toEqual(chosen.map((scope) => scope.name).sort())
      expect('expires_at' in body).toBe(expiry !== 'lifetime')

      if (refused) {
        expect(await screen.findByText('Taken.')).toBeTruthy()
        return
      }
      if (outcome === 'made, no secret') {
        expect(await screen.findByText(name)).toBeTruthy()
        expect(screen.queryByRole('status')).toBeNull()
        return
      }
      const issued = await screen.findByRole('status')
      expect(issued.textContent).toContain(secret)
      fireEvent.click(within(issued).getByRole('button', { name: 'Done' }))
      expect(screen.queryByRole('status')).toBeNull()
      expect(screen.queryByText(secret)).toBeNull()
      expect(screen.getByText(name)).toBeTruthy()
    })

  test('cancels making one', () => {
    freshDom()
    render(<PersonalAccessTokensList initialTokens={[]} scopes={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'New token' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'New token' })).toBeTruthy()
  })
})
