import { createElement } from 'react'

import {
  browserSupportsPasskeys,
  fromAssertion,
  fromCredential,
  inASecureContext,
  toCreationOptions,
  toRequestOptions,
  useBrowserSupportsPasskeys,
} from '@/lib/webauthn'

import { fc, test } from '@fast-check/vitest'
import { renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

// "hi" in base64url, and a value using both characters base64url substitutes (- for +, _ for /).
const HI = 'aGk'
const SUBSTITUTED = 'a-_w'

function bytes(value: Uint8Array) {
  return Array.from(value)
}

describe('toCreationOptions', () => {
  it('decodes the challenge and the user id, which WebAuthn wants as bytes', () => {
    const options = toCreationOptions({
      challenge: HI,
      user: { id: HI, name: 'someone', displayName: 'Someone' },
    })

    expect(bytes(new Uint8Array(options.challenge as ArrayBuffer))).toEqual([104, 105])
    expect(bytes(new Uint8Array(options.user.id as ArrayBuffer))).toEqual([104, 105])
  })

  it('decodes base64url rather than plain base64', () => {
    // The two characters that differ between the alphabets. Decoding this as base64 throws or gives
    // the wrong bytes, so this is the case a naive atob() would fail.
    const options = toCreationOptions({
      challenge: SUBSTITUTED,
      user: { id: HI, name: 'someone', displayName: 'Someone' },
    })

    expect(bytes(new Uint8Array(options.challenge as ArrayBuffer))).toEqual([107, 239, 240])
  })

  it('carries every other field through untouched, since only three are bytes', () => {
    const options = toCreationOptions({
      challenge: HI,
      user: { id: HI, name: 'someone', displayName: 'Someone' },
      rp: { name: 'Project', id: 'project.test' },
      timeout: 60000,
    })

    expect((options as unknown as { rp: unknown }).rp).toEqual({ name: 'Project', id: 'project.test' })
    expect(options.timeout).toBe(60000)
    expect(options.user.name).toBe('someone')
  })

  it('decodes the id of every credential the server says to exclude', () => {
    const options = toCreationOptions({
      challenge: HI,
      user: { id: HI, name: 'someone', displayName: 'Someone' },
      excludeCredentials: [{ id: HI, type: 'public-key', transports: ['internal'] }],
    })

    const excluded = options.excludeCredentials?.[0]
    expect(bytes(new Uint8Array(excluded?.id as ArrayBuffer))).toEqual([104, 105])
    expect(excluded?.transports).toEqual(['internal'])
  })

  it('leaves excludeCredentials absent when the server sent none', () => {
    const options = toCreationOptions({ challenge: HI, user: { id: HI, name: 'a', displayName: 'A' } })

    expect(options.excludeCredentials).toBeUndefined()
  })
})

describe('fromCredential', () => {
  function credential(overrides: Record<string, unknown> = {}) {
    return {
      id: 'credential-id',
      rawId: new Uint8Array([104, 105]).buffer,
      type: 'public-key',
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: new Uint8Array([104, 105]).buffer,
        attestationObject: new Uint8Array([107, 239, 240]).buffer,
        getTransports: () => ['internal', 'hybrid'],
      },
      ...overrides,
    } as unknown as PublicKeyCredential
  }

  it('encodes the buffers back to base64url, which is what the server reads', () => {
    const encoded = fromCredential(credential())

    expect(encoded.rawId).toBe(HI)
    expect(encoded.response.clientDataJSON).toBe(HI)
    // Round-trips the substituting characters rather than emitting + and /.
    expect(encoded.response.attestationObject).toBe(SUBSTITUTED)
  })

  it('reports no transports rather than crashing on a browser that does not offer them', () => {
    // getTransports is optional in the spec, and Safari omitted it for several versions.
    const encoded = fromCredential(
      credential({
        response: {
          clientDataJSON: new Uint8Array([104, 105]).buffer,
          attestationObject: new Uint8Array([104, 105]).buffer,
        },
      })
    )

    expect(encoded.response.transports).toEqual([])
  })
})

describe('browserSupportsPasskeys', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'PublicKeyCredential')

  afterEach(() => {
    if (original) {
      Object.defineProperty(window, 'PublicKeyCredential', original)
    } else {
      delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential
    }
  })

  it('is false where the API is absent, so no button is offered that cannot work', () => {
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential

    expect(browserSupportsPasskeys()).toBe(false)
  })

  it('is true where it is a constructor', () => {
    Object.defineProperty(window, 'PublicKeyCredential', { value: function () {}, configurable: true })

    expect(browserSupportsPasskeys()).toBe(true)
  })

  // Reached during a server render too, where reaching into window would throw rather than answer.
  it('is false with no window to ask', () => {
    const originalWindow = globalThis.window
    // @ts-expect-error - simulating a server render, where window never exists
    delete globalThis.window
    try {
      expect(browserSupportsPasskeys()).toBe(false)
    } finally {
      globalThis.window = originalWindow
    }
  })
})

// Told apart from an old browser, because the two need different answers: one is "use a different
// browser", the other is "this address".
describe('inASecureContext', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext')

  afterEach(() => {
    if (original) {
      Object.defineProperty(window, 'isSecureContext', original)
    }
  })

  it('answers what the page it is on actually is', () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    expect(inASecureContext()).toBe(true)

    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    expect(inASecureContext()).toBe(false)
  })

  // Reached during a server render too, and reaching into window there would throw rather than
  // answer - which would take down the page that only wanted to pick its wording.
  it('is false with no window to ask', () => {
    const originalWindow = globalThis.window
    // @ts-expect-error - simulating a server render, where window never exists
    delete globalThis.window
    try {
      expect(inASecureContext()).toBe(false)
    } finally {
      globalThis.window = originalWindow
    }
  })
})

// base64url is base64 with two characters swapped and the padding dropped, so both halves of the
// round trip have to put it back exactly - a challenge that decodes to the wrong bytes is one the
// authenticator signs over and the server then refuses.
describe('base64url round trip', () => {
  it.each([
    ['one byte, which needs two pad characters', [0]],
    ['two bytes, which need one', [104, 105]],
    ['three bytes, which need none', [104, 105, 33]],
    ['four bytes, which start the next group', [104, 105, 33, 63]],
    ['bytes that encode to both substituted characters', [255, 239, 190]],
  ])('survives %s', (_case, values) => {
    const source = Uint8Array.from(values)
    const credential = {
      id: 'credential-id',
      rawId: source.buffer,
      type: 'public-key',
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: source.buffer,
        attestationObject: source.buffer,
        getTransports: () => [],
      },
    } as unknown as PublicKeyCredential

    const encoded = fromCredential(credential).rawId
    // Neither padding nor the characters base64 would have used: the server reads base64url.
    expect(encoded).not.toContain('=')
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')

    const decoded = toCreationOptions({
      challenge: encoded,
      user: { id: encoded, name: 'someone', displayName: 'Someone' },
    }).user.id as Uint8Array
    expect(bytes(decoded)).toEqual(values)
  })
})

describe('toRequestOptions', () => {
  it('decodes the challenge and every allowed credential id, passing the rest through', () => {
    const options = toRequestOptions({
      challenge: SUBSTITUTED,
      rpId: 'project.test',
      allowCredentials: [{ id: HI, type: 'public-key', transports: ['usb'] }],
    })

    expect(bytes(new Uint8Array(options.challenge as ArrayBuffer))).toEqual([107, 239, 240])
    expect(options.rpId).toBe('project.test')
    const allowed = options.allowCredentials?.[0]
    expect(bytes(new Uint8Array(allowed?.id as ArrayBuffer))).toEqual([104, 105])
    expect(allowed?.type).toBe('public-key')
    expect(allowed?.transports).toEqual(['usb'])
  })

  it('leaves allowCredentials absent when the server sent none', () => {
    expect(toRequestOptions({ challenge: HI }).allowCredentials).toBeUndefined()
  })
})

describe('fromAssertion', () => {
  function assertion(userHandle: ArrayBuffer | null) {
    return {
      id: 'credential-id',
      rawId: new Uint8Array([104, 105]).buffer,
      type: 'public-key',
      getClientExtensionResults: () => ({ appid: false }),
      response: {
        clientDataJSON: new Uint8Array([104, 105]).buffer,
        authenticatorData: new Uint8Array([107, 239, 240]).buffer,
        signature: new Uint8Array([104, 105]).buffer,
        userHandle,
      },
    } as unknown as PublicKeyCredential
  }

  it('encodes every buffer of the answer back to base64url', () => {
    expect(fromAssertion(assertion(new Uint8Array([104, 105]).buffer))).toEqual({
      id: 'credential-id',
      rawId: HI,
      type: 'public-key',
      clientExtensionResults: { appid: false },
      response: { clientDataJSON: HI, authenticatorData: SUBSTITUTED, signature: HI, userHandle: HI },
    })
  })

  it('sends a null user handle as null, since a second-factor key need not carry one', () => {
    expect(fromAssertion(assertion(null)).response.userHandle).toBeNull()
  })
})

describe('useBrowserSupportsPasskeys', () => {
  it('answers what the browser it runs in supports', () => {
    Object.defineProperty(window, 'PublicKeyCredential', { value: function () {}, configurable: true })
    try {
      expect(renderHook(() => useBrowserSupportsPasskeys()).result.current).toBe(true)
    } finally {
      delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential
    }
    expect(renderHook(() => useBrowserSupportsPasskeys()).result.current).toBe(false)
  })

  it('assumes support during a server render, where there is no browser to ask', () => {
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential
    function Probe() {
      return createElement('span', null, String(useBrowserSupportsPasskeys()))
    }

    expect(renderToString(createElement(Probe))).toBe('<span>true</span>')
  })
})

describe('base64url round trip, for any bytes', () => {
  test.prop([fc.uint8Array({ maxLength: 64 })])('decodes back to exactly the bytes it encoded', (source) => {
    const credential = {
      id: 'credential-id',
      rawId: source.buffer,
      type: 'public-key',
      getClientExtensionResults: () => ({}),
      response: { clientDataJSON: source.buffer, attestationObject: source.buffer },
    } as unknown as PublicKeyCredential

    const encoded = fromCredential(credential).rawId
    expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/)
    expect(bytes(new Uint8Array(toRequestOptions({ challenge: encoded }).challenge as ArrayBuffer))).toEqual(
      Array.from(source)
    )
  })
})
