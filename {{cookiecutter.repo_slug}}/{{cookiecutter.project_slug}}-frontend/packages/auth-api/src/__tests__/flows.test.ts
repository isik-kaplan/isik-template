import { hasPendingVerifyEmail, needsReauthentication, pendingMfaTypes } from '../flows'
import { fc, test } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'

describe('hasPendingVerifyEmail', () => {
  it('is true for a pending verify_email flow among others', () => {
    expect(
      hasPendingVerifyEmail({ data: { flows: [{ id: 'login' }, { id: 'verify_email', is_pending: true }] } })
    ).toBe(true)
  })

  it('is false for a verify_email flow that is not pending', () => {
    expect(hasPendingVerifyEmail({ data: { flows: [{ id: 'verify_email', is_pending: false }] } })).toBe(false)
    expect(hasPendingVerifyEmail({ data: { flows: [{ id: 'verify_email' }] } })).toBe(false)
  })

  it('is false for another pending flow', () => {
    expect(hasPendingVerifyEmail({ data: { flows: [{ id: 'mfa_authenticate', is_pending: true }] } })).toBe(false)
  })

  it('is false for a body with no flows, no data, or no body at all', () => {
    expect(hasPendingVerifyEmail({ data: {} })).toBe(false)
    expect(hasPendingVerifyEmail({ errors: [] })).toBe(false)
    expect(hasPendingVerifyEmail(undefined)).toBe(false)
    expect(hasPendingVerifyEmail(null)).toBe(false)
    expect(hasPendingVerifyEmail('verify_email')).toBe(false)
  })

  test.prop([fc.array(fc.record({ id: fc.string(), is_pending: fc.boolean() }))])(
    'is true exactly when some flow is a pending verify_email',
    (flows) => {
      const expected = flows.some((flow) => flow.id === 'verify_email' && flow.is_pending)
      expect(hasPendingVerifyEmail({ data: { flows } })).toBe(expected)
    }
  )
})

describe('pendingMfaTypes', () => {
  it('names the factors a pending challenge can be answered with', () => {
    const error = { data: { flows: [{ id: 'mfa_authenticate', is_pending: true, types: ['totp', 'webauthn'] }] } }

    expect(pendingMfaTypes(error)).toEqual(['totp', 'webauthn'])
  })

  it('finds the challenge among flows that are not it', () => {
    const error = {
      data: {
        flows: [
          { id: 'login', is_pending: true },
          { id: 'mfa_authenticate', is_pending: true, types: ['totp'] },
        ],
      },
    }

    expect(pendingMfaTypes(error)).toEqual(['totp'])
  })

  it('is an empty list, not null, for a pending challenge that names no types', () => {
    expect(pendingMfaTypes({ data: { flows: [{ id: 'mfa_authenticate', is_pending: true }] } })).toEqual([])
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'nope'],
    ['an object with no data', { errors: [] }],
    ['an object whose data is undefined', { data: undefined }],
    ['data with no flows', { data: {} }],
    ['the flow, merely offered', { data: { flows: [{ id: 'mfa_authenticate', types: ['totp'] }] } }],
    ['another pending flow', { data: { flows: [{ id: 'verify_email', is_pending: true }] } }],
  ])('is null for %s', (_case, error) => {
    expect(pendingMfaTypes(error)).toBeNull()
  })
})

describe('needsReauthentication', () => {
  it.each([['reauthenticate'], ['mfa_reauthenticate']])('is true when allauth offers %s', (id) => {
    expect(needsReauthentication({ data: { flows: [{ id: 'login' }, { id }] } })).toBe(true)
  })

  it.each([
    ['an ordinary validation error', { errors: [{ code: 'incorrect_code', message: 'Incorrect code.' }] }],
    ['unrelated flows', { data: { flows: [{ id: 'login' }] } }],
    ['nothing at all', undefined],
  ])('is false for %s', (_case, error) => {
    expect(needsReauthentication(error)).toBe(false)
  })
})
