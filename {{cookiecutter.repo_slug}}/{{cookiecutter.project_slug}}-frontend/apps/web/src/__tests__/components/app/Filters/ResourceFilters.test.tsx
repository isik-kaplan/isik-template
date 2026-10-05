import { ResourceFilters } from '@/components/app/Filters/ResourceFilters'
import { filtersFor } from '@/components/app/Filters/filterSpec'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/app/Filters/useFilterParams', () => ({
  useFilterParams: () => ({ held: () => '', show: vi.fn() }),
}))

type Query = { action?: 'insert' | 'update'; actor?: string }

describe('ResourceFilters', () => {
  it('renders one control per declared filter, in a filter row, beside any extra controls', () => {
    const on = filtersFor<Query>().on
    const specs = [
      on({ name: 'action', label: 'Change', anyLabel: 'All', options: [{ value: 'update', label: 'Updated' }] }),
      on({ name: 'actor', label: 'By', anyLabel: 'Anyone', options: [{ value: 'me', label: 'Me' }] }),
    ]

    const { container } = render(
      <ResourceFilters specs={specs}>
        <button type="button">Extra</button>
      </ResourceFilters>
    )

    expect(screen.getByLabelText('Change')).toBeTruthy()
    expect((screen.getByLabelText('By') as HTMLSelectElement).options[1].text).toBe('Me')
    expect(screen.getByRole('button', { name: 'Extra' })).toBeTruthy()
    expect(container.firstElementChild?.className).toContain('flex-wrap')
  })
})
