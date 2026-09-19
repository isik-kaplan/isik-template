import { extractAuthErrors, toFormErrors } from '../errors'
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

describe('toFormErrors', () => {
  it('groups errors by field, DRF-style', () => {
    const errors = [
      { code: 'required', param: 'email', message: 'Required.' },
      { code: 'invalid', param: 'email', message: 'Not a valid email.' },
      { code: 'too_short', message: 'Too short.' },
    ]
    expect(toFormErrors(errors)).toEqual({
      email: ['Required.', 'Not a valid email.'],
      non_field_errors: ['Too short.'],
    })
  })

  it('returns undefined for an empty or missing error list', () => {
    expect(toFormErrors(undefined)).toBeUndefined()
    expect(toFormErrors([])).toBeUndefined()
  })
})
