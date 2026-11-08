import { ANY, type Asked, filtersFor, queryFrom } from '@/components/app/Filters/filterSpec'
import { LISTING_PAGE_SIZE, pageFrom, pagedQueryFrom } from '@/components/app/Filters/paging'
import { useFilterParams } from '@/components/app/Filters/useFilterParams'

import { navigation } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { renderHook } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect } from 'vitest'

type Query = { status?: string; is_active?: boolean }

const word = fc.stringMatching(/^[a-z]{1,8}$/)

describe('a listing filter', () => {
  test.prop([
    fc.uniqueArray(word, { minLength: 1, maxLength: 4 }),
    fc.option(fc.oneof(word, fc.array(word)), { nil: undefined }),
    fc.boolean(),
    fc.nat(),
  ])('passes on only a value one of its options offers', (values, drawn, offered, pick) => {
    // An offered value drawn half the time: a random word is almost never one of the options.
    const held = offered ? values[pick % values.length] : drawn
    const status = filtersFor<Query>().on({
      name: 'status',
      label: 'Status',
      anyLabel: 'Any',
      options: values.map((value) => ({ value, label: value })),
    })
    const asked: Asked = { status: held }
    expect(queryFrom([status], asked)).toEqual(
      typeof held === 'string' && values.includes(held) ? { status: held } : {}
    )
  })

  test.prop([fc.constantFrom('true', 'false', 'yes', '', undefined)])(
    'reads a yes-or-no filter as a boolean',
    (held) => {
      const active = filtersFor<Query>().boolean({
        name: 'is_active',
        label: 'Active',
        anyLabel: 'Any',
        yes: 'Yes',
        no: 'No',
      })
      expect(active.options.map((option) => option.value)).toEqual(['true', 'false'])
      const expected = held === 'true' || held === 'false' ? { is_active: held === 'true' } : {}
      expect(queryFrom([active], { is_active: held })).toEqual(expected)
      expect(queryFrom([active])).toEqual({})
    }
  )

  test.prop([fc.oneof(fc.integer({ min: -5, max: 500 }).map(String), fc.string(), fc.constant(undefined))])(
    'asks for the page the address names, or the first for anything that is not a page',
    (page) => {
      const number = Number(page)
      const expected = Number.isInteger(number) && number > 0 ? number : 1
      expect(pageFrom({ page })).toBe(expected)
      expect(pagedQueryFrom([], { page })).toEqual({ page: expected, page_size: LISTING_PAGE_SIZE })
      expect(pageFrom()).toBe(1)
      expect(pagedQueryFrom([])).toEqual({ page: 1, page_size: LISTING_PAGE_SIZE })
    }
  )
})

describe('the filters in the address bar', () => {
  test.prop([
    fc.stringMatching(/^(\/[a-z0-9-]{1,8}){1,3}$/),
    fc.dictionary(word, word, { maxKeys: 3 }),
    word,
    fc.oneof(word, fc.constant(ANY), fc.constant('')),
  ])('change one parameter, keep the rest, and go back to the first page', (pathname, held, name, value) => {
    navigation.push.mockClear()
    navigation.pathname = pathname
    navigation.searchParams = new URLSearchParams({ ...held, page: '3' })
    const { result } = renderHook(() => useFilterParams())

    expect(result.current.held(name)).toBe(held[name] ?? '')
    result.current.show(name, value)

    const pushed = new URL(navigation.push.mock.calls[0][0], 'http://x')
    expect(pushed.pathname).toBe(pathname)
    expect(pushed.searchParams.get('page')).toBeNull()
    expect(pushed.searchParams.get(name)).toBe(value && value !== ANY ? value : null)
    for (const [other, kept] of Object.entries(held))
      if (other !== name) expect(pushed.searchParams.get(other)).toBe(kept)
  })
})
