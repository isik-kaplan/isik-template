import { fieldsOf, parseQuery, queryFrom } from '@/lib/queryGrammar'

import { describe, expect, it } from 'vitest'

describe('queryGrammar', () => {
  it("reads a resource's declared fields, and none for a resource it does not know", () => {
    expect(Object.keys(fieldsOf('users'))).toEqual(['is_active', 'is_staff', 'is_superuser'])
    expect(fieldsOf('applicationReviews').approval.values).toEqual(['approved', 'disabled', 'pending', 'withdrawn'])
    expect(fieldsOf('nothing')).toEqual({})
  })

  it('splits what was typed into words to search for and declared fields to narrow by', () => {
    expect(parseQuery('users', '  ada   is_staff:true lovelace ')).toEqual({
      terms: 'ada lovelace',
      chips: [{ field: 'is_staff', value: 'true' }],
    })
  })

  it('refuses a field the resource does not declare, naming the ones it does', () => {
    expect(parseQuery('notifications', 'ada is_staff:true')).toEqual({
      terms: '',
      chips: [],
      problem: { field: 'is_staff', declared: ['unread'] },
    })
  })

  it('reads a word that only looks like a pair as a word', () => {
    expect(parseQuery('users', '1:2 :x a-b:c')).toEqual({ terms: '1:2 :x a-b:c', chips: [] })
  })

  it('searches an address as words, rather than reading its scheme as a field', () => {
    expect(parseQuery('users', 'https://a.test/hook is_staff:true')).toEqual({
      terms: 'https://a.test/hook',
      chips: [{ field: 'is_staff', value: 'true' }],
    })
    expect(parseQuery('users', 'http://a.test').problem).toBeUndefined()
    expect(parseQuery('users', 'https:/a.test').problem?.field).toBe('https')
  })

  it('refuses a field inherited from no declaration at all', () => {
    expect(parseQuery('users', 'constructor:x').problem?.field).toBe('constructor')
  })

  it('compiles the chips and the words into one query', () => {
    expect(queryFrom(parseQuery('users', 'ada is_staff:true is_active:'))).toEqual({
      is_staff: 'true',
      is_active: '',
      search: 'ada',
    })
    expect(queryFrom(parseQuery('users', 'is_staff:true'))).toEqual({ is_staff: 'true' })
    expect(queryFrom(parseQuery('users', ''))).toEqual({})
  })
})
