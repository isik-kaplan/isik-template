import { filtersFor } from '@/components/app/Filters/filterSpec'
import { LISTING_PAGE_SIZE, pageFrom, pagedQueryFrom } from '@/components/app/Filters/paging'

import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

describe('pageFrom', () => {
  it('reads the page the address bar asks for', () => {
    expect(pageFrom({ page: '3' })).toBe(3)
  })

  it('reads anything that is not a page number as the first page', () => {
    expect(pageFrom()).toBe(1)
    for (const page of ['0', '-2', '1.5', 'two', '', ' ']) {
      expect(pageFrom({ page })).toBe(1)
    }
  })

  test.prop([fc.string()])('always answers a whole page number of at least one', (page) => {
    const read = pageFrom({ page })

    expect(Number.isInteger(read) && read >= 1).toBe(true)
  })
})

describe('pagedQueryFrom', () => {
  it('sends the declared filters, the page, and the one shared page size', () => {
    const specs = [
      filtersFor<{ action?: 'insert' | 'update' }>().on({
        name: 'action',
        label: 'Change',
        anyLabel: 'All',
        options: [{ value: 'update', label: 'Updated' }],
      }),
    ]

    expect(pagedQueryFrom(specs, { action: 'update', page: '2', page_size: '1000' })).toEqual({
      action: 'update',
      page: 2,
      page_size: LISTING_PAGE_SIZE,
    })
    expect(pagedQueryFrom(specs)).toEqual({ page: 1, page_size: LISTING_PAGE_SIZE })
  })
})
