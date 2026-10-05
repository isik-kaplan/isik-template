import { ANY, filtersFor, queryFrom } from '@/components/app/Filters/filterSpec'

import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

type Query = { status?: 'open' | 'closed'; archived?: boolean; owner?: string }

const status = filtersFor<Query>().on({
  name: 'status',
  label: 'Status',
  anyLabel: 'Any status',
  options: [
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
  ],
})
const archived = filtersFor<Query>().boolean({
  name: 'archived',
  label: 'Archived',
  anyLabel: 'Either',
  yes: 'Archived',
  no: 'Live',
})

describe('filtersFor', () => {
  it('declares a parameter with the options it was given', () => {
    expect(status).toEqual({
      name: 'status',
      label: 'Status',
      anyLabel: 'Any status',
      options: [
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed' },
      ],
    })
  })

  it('declares a boolean parameter as a true/false pair, marked boolean', () => {
    expect(archived).toEqual({
      name: 'archived',
      label: 'Archived',
      anyLabel: 'Either',
      options: [
        { value: 'true', label: 'Archived' },
        { value: 'false', label: 'Live' },
      ],
      boolean: true,
    })
  })
})

describe('queryFrom', () => {
  it('sends what the address bar holds when it is one of the declared words', () => {
    expect(queryFrom([status], { status: 'open' })).toEqual({ status: 'open' })
  })

  it('sends a boolean parameter as a real boolean', () => {
    expect(queryFrom([archived], { archived: 'true' })).toEqual({ archived: true })
    expect(queryFrom([archived], { archived: 'false' })).toEqual({ archived: false })
  })

  it('drops what is missing, unset, repeated, or not offered', () => {
    expect(queryFrom([status, archived])).toEqual({})
    expect(queryFrom([status], { status: ANY })).toEqual({})
    expect(queryFrom([status], { status: ['open', 'closed'] })).toEqual({})
    expect(queryFrom([status], { status: 'pending' })).toEqual({})
  })

  it('ignores parameters no filter declared', () => {
    expect(queryFrom([status], { status: 'closed', owner: 'mallory' })).toEqual({ status: 'closed' })
  })

  test.prop([fc.dictionary(fc.constantFrom('status', 'archived', 'owner', 'page'), fc.string())])(
    'never sends anything but a declared word, however the address bar was edited',
    (asked) => {
      const query = queryFrom([status, archived], asked)

      expect(Object.keys(query).every((key) => key === 'status' || key === 'archived')).toBe(true)
      if ('status' in query) expect(['open', 'closed']).toContain(query.status)
      if ('archived' in query) expect(typeof query.archived).toBe('boolean')
    }
  )
})
