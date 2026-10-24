import { detailOf, messagesOf, toFormErrors } from '../index'
import { describe, expect, it } from 'vitest'

// Only checks the re-export is wired; the logic is tested in @isikk/core/drf.
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
