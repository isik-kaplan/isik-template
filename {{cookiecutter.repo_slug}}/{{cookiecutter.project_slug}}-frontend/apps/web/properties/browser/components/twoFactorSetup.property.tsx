import { PasskeyList } from '@/components/app-auth/PasskeyList'
import { RecoveryCodesSection } from '@/components/app-auth/RecoveryCodesSection'
import { TotpSetup } from '@/components/app-auth/TotpSetup'

import { sitePath, words } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { navigation, toast } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, vi } from 'vitest'

const browser = vi.hoisted(() => ({ credential: null as Record<string, unknown> | null, secure: true }))
vi.mock('@isikk/core/webauthn', () => ({
  createCredential: vi.fn(async () => {
    if (browser.credential === null) throw new Error('cancelled')
    return browser.credential
  }),
  inASecureContext: () => browser.secure,
}))
vi.mock('qrcode', () => ({ default: { toDataURL: async (url: string) => `data:image/png;base64,${btoa(url)}` } }))

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

const codes = fc.uniqueArray(fc.stringMatching(/^[a-z0-9]{8}$/), { minLength: 1, maxLength: 10 })

/** Answers each auth call by its path and method, the way the backend would for this example's draw. */
function backend(routes: Record<string, Response | (() => Response)>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(String(input))
    const key = `${request.method} ${new URL(request.url).pathname}`
    const found = routes[key]
    if (!found) return json(200, { status: 200, data: {}, meta: { is_authenticated: true } })
    return typeof found === 'function' ? found() : found.clone()
  })
}

const PROVE = json(401, { status: 401, data: { flows: [{ id: 'reauthenticate' }] }, meta: { is_authenticated: true } })

function at(href: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href, pathname: '/profile/two-factor', search: '', origin: 'http://test-project.test' },
  })
}

describe('the authenticator app', () => {
  test.prop([
    fc.webUrl(),
    fc.stringMatching(/^[A-Z2-7]{16}$/),
    fc.stringMatching(/^\d{6}$/),
    codes,
    fc.constantFrom('ok', 'refused', 'prove'),
  ])(
    'turns on with a code, showing the recovery codes once, and keeps the field up when refused',
    async (totpUrl, secret, code, recovery, outcome) => {
      freshDom()
      navigation.refresh.mockClear()
      at('http://test-project.test/profile/two-factor')
      vi.stubGlobal(
        'fetch',
        backend({
          'POST /v0/browser/account/authenticators/totp': {
            ok: json(200, { status: 200, data: { type: 'totp' } }),
            prove: PROVE,
            refused: json(400, {
              status: 400,
              errors: [{ param: 'code', code: 'incorrect_code', message: 'Wrong code.' }],
            }),
          }[outcome as 'ok' | 'prove' | 'refused'],
          'GET /v0/browser/account/authenticators/recovery-codes': json(200, {
            status: 200,
            data: { unused_codes: recovery },
          }),
        })
      )
      render(<TotpSetup active={false} secret={secret} totpUrl={totpUrl} />)

      expect(screen.getByTestId('totp-secret').textContent).toBe(secret)
      expect(await screen.findByRole('img')).toBeTruthy()
      fireEvent.paste(screen.getAllByRole('textbox')[0], { clipboardData: { getData: () => code } })
      fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))

      if (outcome === 'ok') {
        expect(await screen.findByRole('region', { name: 'Your recovery codes' })).toBeTruthy()
        expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(recovery)
        expect(navigation.refresh).toHaveBeenCalled()
        expect(screen.getByText('On')).toBeTruthy()
      } else if (outcome === 'refused') {
        expect(await screen.findByText('Wrong code.')).toBeTruthy()
        expect(screen.queryByText('On')).toBeNull()
      } else {
        await vi.waitFor(() => expect(window.location.href).toMatch(/^\/auth\/prove\?next=/))
        expect(screen.queryByText('Wrong code.')).toBeNull()
      }
    }
  )

  test.prop([fc.boolean()])('turns off, forgetting what it showed', async (refused) => {
    freshDom()
    vi.stubGlobal(
      'fetch',
      backend({
        'DELETE /v0/browser/account/authenticators/totp': refused
          ? json(400, { status: 400, errors: [{ message: 'Not now.' }] })
          : json(200, { status: 200, data: {} }),
      })
    )
    render(<TotpSetup active />)
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    if (refused) {
      await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not now.'))
      expect(screen.getByText('On')).toBeTruthy()
    } else {
      expect(await screen.findByRole('button', { name: 'Turn on' })).toBeTruthy()
    }
  })

  test.prop([fc.option(words, { nil: undefined }), fc.option(sitePath, { nil: '' })])(
    'says why it cannot be turned on, or sends somebody to prove who they are first',
    (blockedReason, proveHref) => {
      freshDom()
      render(<TotpSetup active={false} blockedReason={blockedReason} proveHref={proveHref || '/auth/prove'} />)
      if (blockedReason) {
        expect(screen.getByText(blockedReason)).toBeTruthy()
        expect(screen.queryByRole('link')).toBeNull()
      } else {
        expect(screen.getByRole('link', { name: 'Turn on' }).getAttribute('href')).toBe(proveHref || '/auth/prove')
      }
    }
  )
})

describe('the recovery codes', () => {
  test.prop([fc.nat(10), codes, fc.boolean()])(
    'are counted, and replaced on demand by a set shown once',
    async (unused, fresh, refused) => {
      freshDom()
      vi.stubGlobal(
        'fetch',
        backend({
          'POST /v0/browser/account/authenticators/recovery-codes': refused
            ? json(400, { status: 400, errors: [{ message: 'No.' }] })
            : json(200, { status: 200, data: { unused_codes: fresh } }),
        })
      )
      render(<RecoveryCodesSection unused={unused} total={10} />)
      expect(screen.getByText(new RegExp(`${unused}.*10`))).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }))
      if (refused) {
        await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('No.'))
        expect(screen.queryByRole('region', { name: 'Your recovery codes' })).toBeNull()
      } else {
        expect((await screen.findAllByRole('listitem')).map((item) => item.textContent)).toEqual(fresh)
      }
    }
  )
})

describe('the passkeys', () => {
  const passkeys = fc
    .uniqueArray(
      fc.record({
        id: fc.integer({ min: 1, max: 999 }),
        name: fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,6}( [A-Za-z0-9]{1,5})?$/),
        createdAt: fc.integer({ min: 1600000000, max: 1900000000 }),
      }),
      { selector: (passkey) => passkey.id, maxLength: 3 }
    )
    .filter((list) => new Set(list.map((passkey) => passkey.name)).size === list.length)

  // One property per browser: can, can't, or can't because the page isn't secure.
  for (const [usable, secure, browserKind] of [
    [true, true, 'usable'],
    [false, true, 'unsupported'],
    [false, false, 'insecure'],
  ] as const)
    test.prop([passkeys])(`are listed, with a way to add one only where this browser can: ${browserKind}`, (list) => {
      freshDom()
      browser.secure = secure
      Object.defineProperty(window, 'PublicKeyCredential', {
        configurable: true,
        value: usable ? class {} : undefined,
      })
      render(<PasskeyList passkeys={list} />)
      for (const passkey of list) expect(screen.getByRole('button', { name: `Remove ${passkey.name}` })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Add a passkey' }) !== null).toBe(usable)
      if (!usable)
        expect(
          screen.getByText(
            secure ? "This browser can't use passkeys." : 'Passkeys only work over a secure (https) connection.'
          )
        ).toBeTruthy()
    })

  test.prop([passkeys])('are offered for adding on the first paint, before the browser is asked', (list) => {
    // The server pass assumes support and the browser corrects it on hydration; only a markup render reaches it.
    expect(renderToStaticMarkup(<PasskeyList passkeys={list} />)).toContain('Add a passkey')
  })

  // One property per outcome: the first passkey's recovery codes are one draw in eight otherwise.
  for (const [confirmed, refused, first, outcome] of [
    [true, false, true, 'added, first'],
    [true, false, false, 'added'],
    [true, true, false, 'refused'],
    [false, false, false, 'cancelled'],
  ] as const)
    test.prop([codes])(
      `are added through the browser, showing a first set of recovery codes once, and a cancelled prompt adds nothing: ${outcome}`,
      async (recovery) => {
        freshDom()
        navigation.refresh.mockClear()
        Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: class {} })
        browser.credential = confirmed ? { id: 'new' } : null
        const fetchMock = backend({
          'GET /v0/browser/account/authenticators/webauthn': json(200, {
            status: 200,
            data: { creation_options: { publicKey: { challenge: 'c' } } },
          }),
          'POST /v0/browser/account/authenticators/webauthn': refused
            ? json(400, { status: 400, errors: [{ message: 'Refused.' }] })
            : json(200, { status: 200, data: {}, meta: { recovery_codes_generated: first } }),
          'GET /v0/browser/account/authenticators/recovery-codes': json(200, {
            status: 200,
            data: { unused_codes: recovery },
          }),
        })
        vi.stubGlobal('fetch', fetchMock)
        render(<PasskeyList passkeys={[]} />)
        fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }))
        await vi.waitFor(() =>
          expect((screen.getByRole('button', { name: 'Add a passkey' }) as HTMLButtonElement).disabled).toBe(false)
        )
        const added = confirmed && !refused
        expect(navigation.refresh.mock.calls.length > 0).toBe(added)
        expect(screen.queryByRole('region', { name: 'Your recovery codes' }) !== null).toBe(added && first)
      }
    )

  test.prop([passkeys.filter((list) => list.length > 0), fc.boolean()])(
    'are removed one at a time',
    async (list, refused) => {
      freshDom()
      navigation.refresh.mockClear()
      const fetchMock = backend({
        'DELETE /v0/browser/account/authenticators/webauthn': refused
          ? json(400, { status: 400, errors: [{ message: 'Kept.' }] })
          : json(200, { status: 200, data: [] }),
      })
      vi.stubGlobal('fetch', fetchMock)
      render(<PasskeyList passkeys={list} />)
      fireEvent.click(screen.getByRole('button', { name: `Remove ${list[0].name}` }))
      await vi.waitFor(() =>
        expect((screen.getByRole('button', { name: `Remove ${list[0].name}` }) as HTMLButtonElement).disabled).toBe(
          false
        )
      )
      const sent = fetchMock.mock.calls
        .map(([input]) => input)
        .find((input) => input instanceof Request && input.method === 'DELETE') as Request
      expect(await sent.json()).toEqual({ authenticators: [list[0].id] })
      expect(navigation.refresh.mock.calls.length > 0).toBe(!refused)
    }
  )
})
