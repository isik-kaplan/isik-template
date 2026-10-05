import { useSyncExternalStore } from 'react'

/**
 * The conversion between the JSON allauth sends and the ArrayBuffers WebAuthn insists on.
 *
 * Hand-written rather than `PublicKeyCredential.parseCreationOptionsFromJSON`: Firefox does not ship
 * it, and a passkey that only works in two of three browsers is worse than no passkey button.
 */

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function toBase64Url(value: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(value)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

type CredentialDescriptorJSON = { id: string; type: string; transports?: string[] }

export type CreationOptionsJSON = {
  challenge: string
  user: { id: string; name: string; displayName: string }
  excludeCredentials?: CredentialDescriptorJSON[]
  [key: string]: unknown
}

export type RequestOptionsJSON = {
  challenge: string
  allowCredentials?: CredentialDescriptorJSON[]
  [key: string]: unknown
}

function toDescriptors(descriptors: CredentialDescriptorJSON[] | undefined) {
  return descriptors?.map((descriptor) => ({
    ...descriptor,
    id: fromBase64Url(descriptor.id),
    type: 'public-key' as const,
    transports: descriptor.transports as AuthenticatorTransport[] | undefined,
  }))
}

/** Only the challenge, the user id and the credential ids are bytes; the rest passes through. */
export function toCreationOptions(options: CreationOptionsJSON): PublicKeyCredentialCreationOptions {
  // Through unknown: the JSON shape and the DOM shape genuinely do not overlap - the very gap this
  // function exists to bridge.
  return {
    ...options,
    challenge: fromBase64Url(options.challenge),
    user: { ...options.user, id: fromBase64Url(options.user.id) },
    excludeCredentials: toDescriptors(options.excludeCredentials),
  } as unknown as PublicKeyCredentialCreationOptions
}

export function toRequestOptions(options: RequestOptionsJSON): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: fromBase64Url(options.challenge),
    allowCredentials: toDescriptors(options.allowCredentials),
  } as unknown as PublicKeyCredentialRequestOptions
}

/** A registration, back in the JSON shape allauth reads. */
export function fromCredential(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      attestationObject: toBase64Url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  }
}

/** An assertion - the answer to a login challenge - in the JSON shape allauth reads. */
export function fromAssertion(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      userHandle: response.userHandle ? toBase64Url(response.userHandle) : null,
    },
  }
}

/** Whether this browser can do WebAuthn at all - checked before offering a button that would fail. */
export function browserSupportsPasskeys(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function'
}

// Support can't be answered during the server render, where window does not exist. React renders the
// optimistic server answer, then the real one on hydration, with no mismatch warning.
const subscribeToNothing = () => () => {}
const assumeSupported = () => true

export function useBrowserSupportsPasskeys(): boolean {
  return useSyncExternalStore(subscribeToNothing, browserSupportsPasskeys, assumeSupported)
}

/**
 * WebAuthn only exists in a secure context (https, or localhost), so a capable browser on plain http
 * defines nothing. Told apart from an old browser because the advice differs: "use another browser"
 * versus "use the https address".
 */
export function inASecureContext(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext
}
