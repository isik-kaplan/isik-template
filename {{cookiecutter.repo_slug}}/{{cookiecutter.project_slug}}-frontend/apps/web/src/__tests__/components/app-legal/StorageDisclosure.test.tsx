import { StorageDisclosure } from '@/components/app-legal/StorageDisclosure'

import { STORAGE_ITEMS } from '@/lib/storageDisclosure'

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('StorageDisclosure', () => {
  it('is a section the footer can link to, named by its heading', () => {
    render(<StorageDisclosure />)

    const section = screen.getByRole('region', { name: 'Cookies and storage' })
    expect(section.id).toBe('cookies')
    expect(screen.getByText(/None of it is used for analytics or advertising/)).toBeTruthy()
  })

  it('lists every disclosed item with its type and purpose, in a table with real headers', () => {
    render(<StorageDisclosure />)

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual(['Name', 'Type', 'Purpose'])
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(STORAGE_ITEMS.length)
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(
      STORAGE_ITEMS.map(({ name }) => name)
    )
    expect(within(rows[0]).getByText('Cookie')).toBeTruthy()
    expect(within(rows[0]).getByText('Keeps you signed in between pages.')).toBeTruthy()
    expect(screen.getByText('Local storage')).toBeTruthy()
  })
})
