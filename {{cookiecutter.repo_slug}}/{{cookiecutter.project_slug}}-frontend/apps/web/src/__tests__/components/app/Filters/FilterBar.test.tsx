import { FilterBar } from '@/components/app/Filters/FilterBar'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('FilterBar', () => {
  it('lays its controls out in one wrapping row, aligned along their bottoms', () => {
    const { container } = render(
      <FilterBar>
        <span>control</span>
      </FilterBar>
    )

    expect(screen.getByText('control')).toBeTruthy()
    expect(container.firstElementChild?.className).toBe('flex flex-wrap items-end gap-3')
  })
})
