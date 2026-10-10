import { extractAuthErrors } from '../errors'
import { describe, expect, it } from 'vitest'

describe('extractAuthErrors', () => {
  it('returns the errors array from an allauth error response', () => {
    const response = { status: 400, errors: [{ code: 'required', param: 'email', message: 'Required.' }] }
    expect(extractAuthErrors(response)).toEqual(response.errors)
  })

  it('returns undefined for a response with no errors array', () => {
    expect(extractAuthErrors({ status: 200 })).toBeUndefined()
    expect(extractAuthErrors(null)).toBeUndefined()
  })
})
