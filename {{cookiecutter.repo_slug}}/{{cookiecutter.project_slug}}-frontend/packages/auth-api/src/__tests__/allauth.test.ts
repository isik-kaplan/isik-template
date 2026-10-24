import * as app from '../app'
import { errorsOf, hasPendingVerifyEmail, needsReauthentication, pendingFlow, pendingMfaTypes } from '../index'
import { describe, expect, it } from 'vitest'

// Only checks the re-exports are wired; the logic is tested in @isikk/core/allauth.
describe('allauth helpers re-exported from @isikk/core/allauth', () => {
  const pending = { data: { flows: [{ id: 'mfa_authenticate', is_pending: true, types: ['totp'] }] } }

  it('reads a refusal and the flows still owed', () => {
    expect(errorsOf({ status: 400, errors: [{ message: 'Required.', param: 'email' }] })).toEqual([
      { message: 'Required.', param: 'email' },
    ])
    expect(pendingFlow(pending, 'mfa_authenticate')).toEqual(pending.data.flows[0])
    expect(pendingMfaTypes(pending)).toEqual(['totp'])
    expect(hasPendingVerifyEmail({ data: { flows: [{ id: 'verify_email', is_pending: true }] } })).toBe(true)
    expect(needsReauthentication({ data: { flows: [{ id: 'reauthenticate' }] } })).toBe(true)
  })

  it('offers the same helpers to the app client', () => {
    expect(app.errorsOf).toBe(errorsOf)
    expect(app.pendingMfaTypes).toBe(pendingMfaTypes)
    expect(app.hasPendingVerifyEmail).toBe(hasPendingVerifyEmail)
    expect(app.needsReauthentication).toBe(needsReauthentication)
  })
})
