import { SelectFilter } from '@/components/app/Filters/SelectFilter'

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const show = vi.fn()
let held = ''
vi.mock('@/components/app/Filters/useFilterParams', () => ({ useFilterParams: () => ({ held: () => held, show }) }))

const OPTIONS = [
  { value: 'insert', label: 'Created' },
  { value: 'update', label: 'Updated' },
]

describe('SelectFilter', () => {
  beforeEach(() => {
    show.mockClear()
    held = ''
  })

  it('offers any first, then the options, labelled by its label, on any when nothing is held', () => {
    render(<SelectFilter name="action" label="Change" anyLabel="All changes" options={OPTIONS} />)

    const select = screen.getByLabelText('Change') as HTMLSelectElement
    expect(select.id).toBe('filter-action')
    expect(select.value).toBe('any')
    expect(Array.from(select.options).map((option) => [option.value, option.text])).toEqual([
      ['any', 'All changes'],
      ['insert', 'Created'],
      ['update', 'Updated'],
    ])
  })

  it('shows what the address bar holds', () => {
    held = 'update'
    render(<SelectFilter name="action" label="Change" anyLabel="All changes" options={OPTIONS} />)

    expect((screen.getByLabelText('Change') as HTMLSelectElement).value).toBe('update')
  })

  it('writes the picked word for its own parameter', () => {
    render(<SelectFilter name="action" label="Change" anyLabel="All changes" options={OPTIONS} />)

    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'insert' } })

    expect(show).toHaveBeenCalledExactlyOnceWith('action', 'insert')
  })

  it('takes a caller class on top of its own', () => {
    render(<SelectFilter name="action" label="Change" anyLabel="All" options={OPTIONS} className="w-72" />)

    const select = screen.getByLabelText('Change')
    expect(select.className).toContain('w-72')
    expect(select.className).toContain('border-input')
  })
})
