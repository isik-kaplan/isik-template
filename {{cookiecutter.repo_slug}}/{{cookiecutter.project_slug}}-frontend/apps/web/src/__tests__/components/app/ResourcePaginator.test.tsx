import { filtersFor } from '@/components/app/Filters/filterSpec'
import { ResourcePaginator } from '@/components/app/ResourcePaginator'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

const specs = [
  filtersFor<{ action?: 'insert' | 'update' }>().on({
    name: 'action',
    label: 'Change',
    anyLabel: 'All',
    options: [{ value: 'update', label: 'Updated' }],
  }),
]

describe('ResourcePaginator', () => {
  it('carries the declared filters into its links and drops what was never declared', async () => {
    render(await ResourcePaginator({ specs, asked: { action: 'update', page: '2', junk: 'x' }, totalPages: 3 }))

    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe('?action=update&page=3')
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
  })

  it('starts at the first page when the address bar asks for none', async () => {
    render(await ResourcePaginator({ specs, totalPages: 2 }))

    expect(screen.getByText('Page 1 of 2')).toBeTruthy()
  })
})
