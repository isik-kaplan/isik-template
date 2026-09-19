import { detailOf, messagesOf, toFormErrors } from '../index'
import { describe, expect, it } from 'vitest'

// The actual reading logic is @isikk/core/drf's own, and tested there - this only confirms the
// re-export is wired to it, against the two shapes a real DRF backend sends.
describe('DRF error helpers re-exported from @isikk/core/drf', () => {
  it('reads a 400 validation failure', () => {
    expect(toFormErrors({ name: ['This field may not be blank.'] })).toEqual({
      name: ['This field may not be blank.'],
    })
  })

  it('reads a 403/404/409 refusal', () => {
    expect(detailOf({ detail: 'Not found.' })).toBe('Not found.')
  })

  it('flattens either shape to one line for a caller with nowhere to put it per field', () => {
    expect(messagesOf(toFormErrors({ non_field_errors: ['Those two do not go together.'] }))).toBe(
      'Those two do not go together.'
    )
  })
})
